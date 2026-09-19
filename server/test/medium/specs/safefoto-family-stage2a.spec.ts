import { Kysely } from 'kysely';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto household lifecycle - Stage 2A', () => {
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

  it('moves a user to another household and requires a full sync reset for every session', async () => {
    const { user: householdMember } = await ctx.newUser();
    const { user: movingUser } = await ctx.newUser();
    const { session: firstSession } = await ctx.newSession({ userId: movingUser.id });
    const { session: secondSession } = await ctx.newSession({ userId: movingUser.id });

    const target = await database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', householdMember.id)
      .executeTakeFirstOrThrow();

    await expect(users.moveToHouseholdOf(movingUser.id, householdMember.id)).resolves.toEqual({
      id: movingUser.id,
      householdId: target.householdId,
    });

    const sessions = await database
      .selectFrom('session')
      .select(['id', 'isPendingSyncReset'])
      .where('id', 'in', [firstSession.id, secondSession.id])
      .orderBy('id')
      .execute();

    expect(sessions).toHaveLength(2);
    expect(sessions.every(({ isPendingSyncReset }) => isPendingSyncReset)).toBe(true);
  });

  it('does not reset sessions when the user is already in the target household', async () => {
    const { user: householdMember } = await ctx.newUser();
    const { user: movingUser } = await ctx.newUser();

    await users.moveToHouseholdOf(movingUser.id, householdMember.id);
    const { session } = await ctx.newSession({ userId: movingUser.id });

    await expect(users.moveToHouseholdOf(movingUser.id, householdMember.id)).resolves.toEqual(
      expect.objectContaining({ id: movingUser.id }),
    );

    await expect(
      database
        .selectFrom('session')
        .select('isPendingSyncReset')
        .where('id', '=', session.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ isPendingSyncReset: false });
  });

  it('fails closed for a missing household member without changing the user or session', async () => {
    const { user } = await ctx.newUser();
    const { session } = await ctx.newSession({ userId: user.id });

    const before = await database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();

    await expect(users.moveToHouseholdOf(user.id, 'ffffffff-ffff-4fff-8fff-ffffffffffff')).resolves.toBeUndefined();

    await expect(
      database.selectFrom('user').select('householdId').where('id', '=', user.id).executeTakeFirstOrThrow(),
    ).resolves.toEqual(before);
    await expect(
      database
        .selectFrom('session')
        .select('isPendingSyncReset')
        .where('id', '=', session.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ isPendingSyncReset: false });
  });
});
