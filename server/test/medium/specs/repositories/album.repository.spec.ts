import { Kysely } from 'kysely';
import { AlbumUserRole } from 'src/enum';
import { AlbumRepository } from 'src/repositories/album.repository';
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
  return { ctx, sut: ctx.get(AlbumRepository) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe(AlbumRepository.name, () => {
  it('returns album membership inside the same household', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { householdId } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', owner.id)
      .executeTakeFirstOrThrow();
    await ctx.database.updateTable('user').set({ householdId, isHouseholdAdmin: false }).where('id', '=', member.id).execute();
    const { result: album } = await ctx.newAlbum({ ownerId: owner.id });
    await ctx.database
      .insertInto('album_user')
      .values({ albumId: album.id, userId: member.id, role: AlbumUserRole.Viewer })
      .execute();

    await expect(sut.getAll(member.id)).resolves.toEqual([expect.objectContaining({ id: album.id })]);
    await expect(sut.getAllIds(member.id)).resolves.toEqual([album.id]);
    await expect(sut.getById(album.id, { withAssets: false }, member.id)).resolves.toEqual(
      expect.objectContaining({ id: album.id }),
    );
  });

  it('hides stale album membership after the user leaves the household', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
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
    await ctx.database
      .insertInto('album_user')
      .values({ albumId: album.id, userId: member.id, role: AlbumUserRole.Viewer })
      .execute();
    await ctx.database
      .updateTable('user')
      .set({ householdId: outsiderHouseholdId, isHouseholdAdmin: false })
      .where('id', '=', member.id)
      .execute();

    await expect(sut.getAll(member.id)).resolves.toEqual([]);
    await expect(sut.getAllIds(member.id)).resolves.toEqual([]);
    await expect(sut.getById(album.id, { withAssets: false }, member.id)).resolves.toBeUndefined();
    await expect(sut.getById(album.id, { withAssets: false }, owner.id)).resolves.toEqual(
      expect.objectContaining({ id: album.id }),
    );
  });

  it('hides stale album membership from asset based lookups', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
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
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    const { result: album } = await ctx.newAlbum({ ownerId: owner.id }, [asset.id]);
    await ctx.database
      .insertInto('album_user')
      .values({ albumId: album.id, userId: member.id, role: AlbumUserRole.Viewer })
      .execute();
    await ctx.database
      .updateTable('user')
      .set({ householdId: outsiderHouseholdId, isHouseholdAdmin: false })
      .where('id', '=', member.id)
      .execute();

    await expect(sut.getByAssetId(member.id, asset.id)).resolves.toEqual([]);
    await expect(sut.getByAssetIds(member.id, [asset.id])).resolves.toEqual(new Map());

    const ownerMap = await sut.getByAssetIds(owner.id, [asset.id]);
    expect(ownerMap.get(asset.id)).toContain(album.id);
  });
});
