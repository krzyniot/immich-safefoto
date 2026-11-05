import { Kysely, sql } from 'kysely';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto Stage29B: actual user deletion audit on isolated PostgreSQL', () => {
  let db: Kysely<DB>;
  let factory: SyncTestContext;
  let users: UserRepository;

  beforeAll(async () => {
    db = await getKyselyDB();
    factory = new SyncTestContext(db);
    users = new UserRepository(db);
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it('keeps the active user-delete trigger and household-aware function in PostgreSQL', async () => {
    const functions = await sql<{ name: string; definition: string }>`
      SELECT p.proname AS name, pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'user_delete_audit'
    `.execute(db);
    expect(functions.rows).toHaveLength(1);
    expect(functions.rows[0].definition).toContain('"householdId"');

    const triggers = await sql<{ name: string; enabled: string }>`
      SELECT tgname AS name, tgenabled AS enabled
      FROM pg_trigger
      WHERE tgname = 'user_delete_audit' AND tgrelid = 'public."user"'::regclass
    `.execute(db);
    expect(triggers.rows).toEqual([{ name: 'user_delete_audit', enabled: 'O' }]);
  });

  it('records user and household IDs on hard delete without dropping the household snapshot', async () => {
    const { user } = await factory.newUser();
    const original = await db
      .selectFrom('user')
      .select(['id', 'householdId'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();

    expect(await db.selectFrom('user_audit').select('userId').where('userId', '=', user.id).execute()).toEqual([]);

    await users.delete({ id: user.id }, true);

    const audit = await db
      .selectFrom('user_audit')
      .select(['userId', 'householdId'])
      .where('userId', '=', user.id)
      .execute();
    expect(audit).toEqual([{ userId: original.id, householdId: original.householdId }]);
    expect(await db.selectFrom('user').select('id').where('id', '=', user.id).execute()).toEqual([]);
  });

  it('does not record a deletion for soft-deleted users or other household members', async () => {
    const { user: first } = await factory.newUser();
    const { user: other } = await factory.newUser();
    await users.delete({ id: first.id }, false);

    expect(
      await db.selectFrom('user_audit').select('userId').where('userId', 'in', [first.id, other.id]).execute(),
    ).toEqual([]);
    expect(await db.selectFrom('user').select('id').where('id', '=', other.id).execute()).toHaveLength(1);
  });
});
