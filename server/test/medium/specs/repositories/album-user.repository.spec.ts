import { Kysely } from 'kysely';
import { AlbumUserRole } from 'src/enum';
import { AlbumUserRepository } from 'src/repositories/album-user.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const setup = () => {
  const { ctx } = newMediumService(BaseService, {
    database: defaultDatabase,
    real: [],
    mock: [LoggingRepository],
  });
  return { ctx, sut: ctx.get(AlbumUserRepository) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe(AlbumUserRepository.name, () => {
  it('rejects creating album membership across different households', async () => {
    const { ctx, sut } = setup();
    const { result: owner } = await ctx.newUser();
    const { result: outsider } = await ctx.newUser();
    const { result: album } = await ctx.newAlbum({ ownerId: owner.id });

    await expect(sut.create({ albumId: album.id, userId: outsider.id, role: AlbumUserRole.Viewer })).rejects.toThrow();
  });
  it('creates album membership inside the same household', async () => {
    const { ctx, sut } = setup();
    const { result: owner } = await ctx.newUser();
    const { result: member } = await ctx.newUser();
    const { householdId } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', owner.id)
      .executeTakeFirstOrThrow();
    await ctx.database.updateTable('user').set({ householdId, isHouseholdAdmin: false }).where('id', '=', member.id).execute();
    const { result: album } = await ctx.newAlbum({ ownerId: owner.id });

    await expect(sut.create({ albumId: album.id, userId: member.id, role: AlbumUserRole.Viewer })).resolves.toEqual(
      expect.objectContaining({ albumId: album.id, userId: member.id, role: AlbumUserRole.Viewer }),
    );
  });

  it('does not update stale album membership across different households', async () => {
    const { ctx, sut } = setup();
    const { result: owner } = await ctx.newUser();
    const { result: member } = await ctx.newUser();
    const { result: outsider } = await ctx.newUser();
    const { householdId: ownerHouseholdId } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', owner.id)
      .executeTakeFirstOrThrow();
    const { householdId: outsiderHouseholdId } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', outsider.id)
      .executeTakeFirstOrThrow();
    await ctx.database.updateTable('user').set({ householdId: ownerHouseholdId, isHouseholdAdmin: false }).where('id', '=', member.id).execute();
    const { result: album } = await ctx.newAlbum({ ownerId: owner.id });
    await sut.create({ albumId: album.id, userId: member.id, role: AlbumUserRole.Viewer });
    await ctx.database
      .updateTable('user')
      .set({ householdId: outsiderHouseholdId, isHouseholdAdmin: false })
      .where('id', '=', member.id)
      .execute();

    await sut.update({ albumId: album.id, userId: member.id }, { role: AlbumUserRole.Editor });
    const relation = await ctx.database
      .selectFrom('album_user')
      .select(['role'])
      .where('albumId', '=', album.id)
      .where('userId', '=', member.id)
      .executeTakeFirstOrThrow();
    expect(relation.role).toBe(AlbumUserRole.Viewer);
  });

  it('does not delete stale album membership across different households', async () => {
    const { ctx, sut } = setup();
    const { result: owner } = await ctx.newUser();
    const { result: member } = await ctx.newUser();
    const { result: outsider } = await ctx.newUser();
    const { householdId: ownerHouseholdId } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', owner.id)
      .executeTakeFirstOrThrow();
    const { householdId: outsiderHouseholdId } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', outsider.id)
      .executeTakeFirstOrThrow();
    await ctx.database.updateTable('user').set({ householdId: ownerHouseholdId, isHouseholdAdmin: false }).where('id', '=', member.id).execute();
    const { result: album } = await ctx.newAlbum({ ownerId: owner.id });
    await sut.create({ albumId: album.id, userId: member.id, role: AlbumUserRole.Viewer });
    await ctx.database
      .updateTable('user')
      .set({ householdId: outsiderHouseholdId, isHouseholdAdmin: false })
      .where('id', '=', member.id)
      .execute();

    await sut.delete({ albumId: album.id, userId: member.id });
    const relation = await ctx.database
      .selectFrom('album_user')
      .select(['userId'])
      .where('albumId', '=', album.id)
      .where('userId', '=', member.id)
      .executeTakeFirst();
    expect(relation).toBeDefined();
  });
  it('updates album membership inside the same household', async () => {
    const { ctx, sut } = setup();
    const { result: owner } = await ctx.newUser();
    const { result: member } = await ctx.newUser();
    const { householdId } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', owner.id)
      .executeTakeFirstOrThrow();
    await ctx.database.updateTable('user').set({ householdId, isHouseholdAdmin: false }).where('id', '=', member.id).execute();
    const { result: album } = await ctx.newAlbum({ ownerId: owner.id });
    await sut.create({ albumId: album.id, userId: member.id, role: AlbumUserRole.Viewer });

    await sut.update({ albumId: album.id, userId: member.id }, { role: AlbumUserRole.Editor });
    const relation = await ctx.database
      .selectFrom('album_user')
      .select(['role'])
      .where('albumId', '=', album.id)
      .where('userId', '=', member.id)
      .executeTakeFirstOrThrow();
    expect(relation.role).toBe(AlbumUserRole.Editor);
  });

  it('deletes album membership inside the same household', async () => {
    const { ctx, sut } = setup();
    const { result: owner } = await ctx.newUser();
    const { result: member } = await ctx.newUser();
    const { householdId } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', owner.id)
      .executeTakeFirstOrThrow();
    await ctx.database.updateTable('user').set({ householdId, isHouseholdAdmin: false }).where('id', '=', member.id).execute();
    const { result: album } = await ctx.newAlbum({ ownerId: owner.id });
    await sut.create({ albumId: album.id, userId: member.id, role: AlbumUserRole.Viewer });

    await sut.delete({ albumId: album.id, userId: member.id });
    const relation = await ctx.database
      .selectFrom('album_user')
      .select(['userId'])
      .where('albumId', '=', album.id)
      .where('userId', '=', member.id)
      .executeTakeFirst();
    expect(relation).toBeUndefined();
  });
});
