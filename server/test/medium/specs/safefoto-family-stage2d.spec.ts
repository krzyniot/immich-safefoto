import { Kysely } from 'kysely';
import { AlbumUserRole } from 'src/enum';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto household lifecycle - Stage 2D', () => {
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

  it('does not restore old partner or album sharing after leaving and rejoining a household', async () => {
    const { user: movingUser } = await ctx.newUser();
    const { user: oldMember } = await ctx.newUser();
    const { user: temporaryMember } = await ctx.newUser();
    await moveFixtureUser(oldMember.id, movingUser.id);
    await users.transferHouseholdAdmin(movingUser.id, oldMember.id);

    await ctx.newPartner({ sharedById: movingUser.id, sharedWithId: oldMember.id });
    const { album } = await ctx.newAlbum({ ownerId: oldMember.id });
    await ctx.newAlbumUser({ albumId: album.id, userId: movingUser.id, role: AlbumUserRole.Viewer });

    await users.moveToHouseholdOf(movingUser.id, temporaryMember.id);
    await users.moveToHouseholdOf(movingUser.id, oldMember.id);

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
        .where('albumId', '=', album.id)
        .where('userId', '=', movingUser.id)
        .execute(),
    ).resolves.toEqual([]);
  });

  it('keeps a restored user in the old household after another user detaches', async () => {
    const { user: movingUser } = await ctx.newUser();
    const { user: deletedMember } = await ctx.newUser();
    await moveFixtureUser(deletedMember.id, movingUser.id);
    const oldHouseholdId = await householdIdOf(movingUser.id);

    await users.update(deletedMember.id, { deletedAt: new Date() });
    const moved = await users.moveToNewHousehold(movingUser.id);

    expect(moved).toBeDefined();
    expect(moved?.householdId).not.toBe(oldHouseholdId);

    await users.restore(deletedMember.id);

    await expect(users.getHouseholdId(deletedMember.id)).resolves.toEqual({ householdId: oldHouseholdId });
    await expect(users.getHouseholdId(movingUser.id)).resolves.toEqual({ householdId: moved!.householdId });
  });

  it('removes a household only after its last user is permanently deleted', async () => {
    const { user: firstUser } = await ctx.newUser();
    const { user: secondUser } = await ctx.newUser();
    await moveFixtureUser(secondUser.id, firstUser.id);
    const householdId = await householdIdOf(firstUser.id);

    await users.delete({ id: firstUser.id }, true);
    await expect(
      database.selectFrom('household').select('id').where('id', '=', householdId).executeTakeFirst(),
    ).resolves.toEqual({ id: householdId });

    await users.delete({ id: secondUser.id }, true);
    await expect(
      database.selectFrom('household').select('id').where('id', '=', householdId).executeTakeFirst(),
    ).resolves.toBeUndefined();
  });
});
