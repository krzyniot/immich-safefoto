import { Kysely } from 'kysely';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto household management - Stage 3A', () => {
  let database: Kysely<DB>;
  let ctx: SyncTestContext;

  beforeAll(async () => {
    database = await getKyselyDB();
    ctx = new SyncTestContext(database);
  });

  afterAll(async () => {
    await database.destroy();
  });

  it('creates a new household with its creator as admin and automatic quota allocation enabled', async () => {
    const { user } = await ctx.newUser();

    const createdUser = await database
      .selectFrom('user')
      .select(['householdId', 'isHouseholdAdmin'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();

    expect(createdUser.isHouseholdAdmin).toBe(true);

    await expect(
      database
        .selectFrom('household')
        .select(['quotaSizeInBytes', 'isQuotaAutoBalanced'])
        .where('id', '=', createdUser.householdId)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({
      quotaSizeInBytes: null,
      isQuotaAutoBalanced: true,
    });
  });

  it('allows at most one household admin', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();

    const { householdId } = await database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', admin.id)
      .executeTakeFirstOrThrow();

    await database
      .updateTable('user')
      .set({ householdId, isHouseholdAdmin: false })
      .where('id', '=', member.id)
      .execute();

    await expect(
      database.updateTable('user').set({ isHouseholdAdmin: true }).where('id', '=', member.id).execute(),
    ).rejects.toThrow();

    await expect(
      database
        .selectFrom('user')
        .select(['id', 'isHouseholdAdmin'])
        .where('householdId', '=', householdId)
        .orderBy('id')
        .execute(),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: admin.id, isHouseholdAdmin: true }),
        expect.objectContaining({ id: member.id, isHouseholdAdmin: false }),
      ]),
    );
  });
});
