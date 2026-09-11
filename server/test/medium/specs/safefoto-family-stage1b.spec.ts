import { Kysely, sql } from 'kysely';
import { SyncRepository } from 'src/repositories/sync.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import {
  up as addHouseholdAudit,
  down as removeHouseholdAudit,
} from 'src/schema/migrations/1789146351047-AddHouseholdToUserAudit';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

const collect = async <T>(stream: AsyncIterableIterator<T>) => {
  const rows: T[] = [];
  for await (const row of stream) {
    rows.push(row);
  }
  return rows;
};

describe('SafeFoto household-aware user sync', () => {
  let database: Kysely<DB>;

  beforeAll(async () => {
    database = await getKyselyDB();
  });

  afterAll(async () => {
    await database.destroy();
  });

  it('removes legacy user audit rows instead of guessing their household', async () => {
    await removeHouseholdAudit(database);
    await sql`INSERT INTO "user_audit" ("userId") VALUES ('00000000-0000-4000-8000-000000000001'::uuid);`.execute(
      database,
    );

    await addHouseholdAudit(database);

    const audits = await database.selectFrom('user_audit').selectAll().execute();
    const { rows } = await sql<{ isNullable: string }>`
      SELECT is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_audit'
        AND column_name = 'householdId'
    `.execute(database);

    expect(audits).toEqual([]);
    expect(rows).toEqual([{ isNullable: 'NO' }]);
  });

  it('persists the deleted user household without an FK dependency', async () => {
    const ctx = new SyncTestContext(database);
    const { user } = await ctx.newUser({ email: 'stage1b-audit@example.invalid' });
    const snapshot = await database
      .selectFrom('user')
      .select(['id', 'householdId'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();

    await ctx.get(UserRepository).delete({ id: user.id }, true);
    const audit = await database
      .selectFrom('user_audit')
      .select(['userId', 'householdId'])
      .where('userId', '=', user.id)
      .executeTakeFirstOrThrow();

    expect(audit).toEqual({ userId: user.id, householdId: snapshot.householdId });

    await database.deleteFrom('household').where('id', '=', snapshot.householdId).execute();
    await expect(
      database
        .selectFrom('user_audit')
        .select(['userId', 'householdId'])
        .where('userId', '=', user.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual(audit);
  });

  it('returns no user upserts or deletes when the requester lookup is missing', async () => {
    const sync = new SyncRepository(database).user;
    const options = {
      nowId: 'ffffffff-ffff-7fff-bfff-ffffffffffff',
      userId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    };

    await expect(collect(sync.getUpserts(options))).resolves.toEqual([]);
    await expect(collect(sync.getDeletes(options))).resolves.toEqual([]);
  });
});
