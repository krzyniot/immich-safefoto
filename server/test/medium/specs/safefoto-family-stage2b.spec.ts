import { Kysely } from 'kysely';
import { AlbumUserRole } from 'src/enum';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto household lifecycle - Stage 2B', () => {
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

  it('severs direct sharing relations and resets every affected user after a household move', async () => {
    const { user: movingUser } = await ctx.newUser();
    const { user: oldMember } = await ctx.newUser();
    const { user: targetMember } = await ctx.newUser();
    await moveFixtureUser(oldMember.id, movingUser.id);
    await users.transferHouseholdAdmin(movingUser.id, oldMember.id);

    await ctx.newPartner({ sharedById: movingUser.id, sharedWithId: oldMember.id });

    const { album: oldMemberAlbum } = await ctx.newAlbum({ ownerId: oldMember.id });
    await ctx.newAlbumUser({ albumId: oldMemberAlbum.id, userId: movingUser.id, role: AlbumUserRole.Viewer });

    const { album: movingUserAlbum } = await ctx.newAlbum({ ownerId: movingUser.id });
    await ctx.newAlbumUser({ albumId: movingUserAlbum.id, userId: oldMember.id, role: AlbumUserRole.Viewer });

    const { session: movingSession } = await ctx.newSession({ userId: movingUser.id });
    const { session: oldMemberSession } = await ctx.newSession({ userId: oldMember.id });
    const { session: targetSession } = await ctx.newSession({ userId: targetMember.id });

    await users.moveToHouseholdOf(movingUser.id, targetMember.id);

    await expect(
      database
        .selectFrom('partner')
        .select(['sharedById', 'sharedWithId'])
        .where((eb) => eb.or([eb('sharedById', '=', movingUser.id), eb('sharedWithId', '=', movingUser.id)]))
        .execute(),
    ).resolves.toEqual([]);

    await expect(
      database
        .selectFrom('album_user')
        .select(['albumId', 'userId', 'role'])
        .where('albumId', '=', oldMemberAlbum.id)
        .orderBy('userId')
        .execute(),
    ).resolves.toEqual([expect.objectContaining({ userId: oldMember.id, role: AlbumUserRole.Owner })]);

    await expect(
      database
        .selectFrom('album_user')
        .select(['albumId', 'userId', 'role'])
        .where('albumId', '=', movingUserAlbum.id)
        .orderBy('userId')
        .execute(),
    ).resolves.toEqual([expect.objectContaining({ userId: movingUser.id, role: AlbumUserRole.Owner })]);

    const sessions = await database
      .selectFrom('session')
      .select(['id', 'isPendingSyncReset'])
      .where('id', 'in', [movingSession.id, oldMemberSession.id, targetSession.id])
      .execute();
    const resetById = new Map(sessions.map((session) => [session.id, session.isPendingSyncReset]));
    expect(resetById.get(movingSession.id)).toBe(true);
    expect(resetById.get(oldMemberSession.id)).toBe(true);
    expect(resetById.get(targetSession.id)).toBe(false);
  });

  it('removes an orphaned source household after its last user moves away', async () => {
    const { user: movingUser } = await ctx.newUser();
    const { user: targetMember } = await ctx.newUser();
    const oldHouseholdId = await householdIdOf(movingUser.id);

    await users.moveToHouseholdOf(movingUser.id, targetMember.id);

    await expect(
      database.selectFrom('household').select('id').where('id', '=', oldHouseholdId).executeTakeFirst(),
    ).resolves.toBeUndefined();
  });
});
