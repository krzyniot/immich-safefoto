import { Kysely } from 'kysely';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto household admin lifecycle - Stage 2C', () => {
  let database: Kysely<DB>;
  let ctx: SyncTestContext;
  let users: UserRepository;

  beforeAll(async () => {
    database = await getKyselyDB();
    ctx = new SyncTestContext(database);
    users = ctx.get(UserRepository);
  });

  afterAll(async () => {
    await database.destroy();
  });

  const householdIdOf = async (userId: string) =>
    (await database.selectFrom('user').select('householdId').where('id', '=', userId).executeTakeFirstOrThrow())
      .householdId;

  const moveFixtureUser = async (userId: string, householdMemberId: string) => {
    const householdId = await householdIdOf(householdMemberId);
    await database.updateTable('user').set({ householdId, isHouseholdAdmin: false }).where('id', '=', userId).execute();
  };

  it('detaches a user into a new household and applies the same sharing cleanup', async () => {
    const { user: movingUser } = await ctx.newUser();
    const { user: oldMember } = await ctx.newUser();
    await moveFixtureUser(oldMember.id, movingUser.id);
    await users.transferHouseholdAdmin(movingUser.id, oldMember.id);
    const oldHouseholdId = await householdIdOf(movingUser.id);

    await ctx.newPartner({ sharedById: movingUser.id, sharedWithId: oldMember.id });
    const { session: movingSession } = await ctx.newSession({ userId: movingUser.id });
    const { session: oldMemberSession } = await ctx.newSession({ userId: oldMember.id });

    const moved = await users.moveToNewHousehold(movingUser.id);
    expect(moved).toEqual(expect.objectContaining({ id: movingUser.id }));
    expect(moved?.householdId).not.toBe(oldHouseholdId);

    await expect(users.getHouseholdId(movingUser.id)).resolves.toEqual({ householdId: moved!.householdId });
    await expect(users.getByHousehold(movingUser.id)).resolves.toEqual([
      expect.objectContaining({ id: movingUser.id }),
    ]);
    await expect(users.getByHousehold(oldMember.id)).resolves.toEqual([expect.objectContaining({ id: oldMember.id })]);

    await expect(
      database
        .selectFrom('partner')
        .select(['sharedById', 'sharedWithId'])
        .where((eb) => eb.or([eb('sharedById', '=', movingUser.id), eb('sharedWithId', '=', movingUser.id)]))
        .execute(),
    ).resolves.toEqual([]);

    const sessions = await database
      .selectFrom('session')
      .select(['id', 'isPendingSyncReset'])
      .where('id', 'in', [movingSession.id, oldMemberSession.id])
      .execute();
    expect(sessions.every(({ isPendingSyncReset }) => isPendingSyncReset)).toBe(true);

    await expect(
      database.selectFrom('household').select('id').where('id', '=', oldHouseholdId).executeTakeFirst(),
    ).resolves.toEqual({ id: oldHouseholdId });
  });

  it('does not churn household or sync state when an already independent user is detached again', async () => {
    const { user } = await ctx.newUser();
    const { session } = await ctx.newSession({ userId: user.id });
    const householdId = await householdIdOf(user.id);

    await expect(users.moveToNewHousehold(user.id)).resolves.toEqual({ id: user.id, householdId });
    await expect(
      database
        .selectFrom('session')
        .select('isPendingSyncReset')
        .where('id', '=', session.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ isPendingSyncReset: false });
    await expect(users.getHouseholdId(user.id)).resolves.toEqual({ householdId });
  });
});
