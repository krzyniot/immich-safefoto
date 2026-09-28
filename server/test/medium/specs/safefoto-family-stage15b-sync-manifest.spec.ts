import { Kysely } from 'kysely';
import { FamilyPhotoPublicationMode as Mode } from 'src/dtos/family-photo.dto';
import { AssetVisibility } from 'src/enum';
import { FamilyAlbumRepository } from 'src/repositories/family-album.repository';
import { FamilyPhotoRepository } from 'src/repositories/family-photo.repository';
import { FamilySyncRepository } from 'src/repositories/family-sync.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto family sync snapshot - Stage 15B', () => {
  let db: Kysely<DB>;
  let ctx: SyncTestContext;
  let albums: FamilyAlbumRepository;
  let photos: FamilyPhotoRepository;
  let sync: FamilySyncRepository;
  let users: UserRepository;

  beforeAll(async () => {
    db = await getKyselyDB();
    ctx = new SyncTestContext(db);
    albums = new FamilyAlbumRepository(db);
    photos = new FamilyPhotoRepository(db);
    sync = new FamilySyncRepository(db);
    users = new UserRepository(db);
  });

  afterAll(async () => db.destroy());

  const family = async () => {
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, owner.id);
    return { owner, member, outsider };
  };

  it('provides the same complete family view to both members, excluding private and outsider photos', async () => {
    const { owner, member, outsider } = await family();
    const { asset: ownerPhoto } = await ctx.newAsset({ ownerId: owner.id });
    const { asset: privatePhoto } = await ctx.newAsset({ ownerId: owner.id });
    const { asset: memberPhoto } = await ctx.newAsset({ ownerId: member.id });
    const { asset: outsiderPhoto } = await ctx.newAsset({ ownerId: outsider.id });
    const { album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Weekend' }, [ownerPhoto.id]);

    await albums.publishAlbum(owner.id, album.id, Mode.Move);
    await albums.addPhotos(member.id, album.id, [memberPhoto.id], Mode.Share);
    await photos.publish(outsider.id, [outsiderPhoto.id], Mode.Share);

    const ownerManifest = await sync.getManifest(owner.id);
    const memberManifest = await sync.getManifest(member.id);
    const outsiderManifest = await sync.getManifest(outsider.id);

    expect(ownerManifest.version).toBe(1);
    expect(ownerManifest.householdId).toBe(memberManifest.householdId);
    expect(ownerManifest.householdId).not.toBe(outsiderManifest.householdId);
    expect(ownerManifest.assets.map(({ id }) => id)).toEqual([ownerPhoto.id, memberPhoto.id].sort());
    expect(ownerManifest.assets.find(({ id }) => id === ownerPhoto.id)).toMatchObject({
      ownerId: owner.id,
      hideFromPersonalTimeline: true,
    });
    expect(ownerManifest.assets.find(({ id }) => id === memberPhoto.id)).toMatchObject({
      ownerId: member.id,
      hideFromPersonalTimeline: false,
    });
    expect(memberManifest.assets).toEqual(ownerManifest.assets);
    expect(ownerManifest.albums).toEqual([expect.objectContaining({ id: album.id, name: 'Weekend' })]);
    expect(ownerManifest.albumAssets).toEqual(
      [
        { albumId: album.id, assetId: ownerPhoto.id },
        { albumId: album.id, assetId: memberPhoto.id },
      ].sort((a, b) => a.assetId.localeCompare(b.assetId)),
    );
    expect(memberManifest.albums).toEqual(ownerManifest.albums);
    expect(memberManifest.albumAssets).toEqual(ownerManifest.albumAssets);
    expect(outsiderManifest.assets.map(({ id }) => id)).toEqual([outsiderPhoto.id]);
    expect(outsiderManifest.albums).toEqual([]);
    expect(outsiderManifest.albumAssets).toEqual([]);
    expect(ownerManifest.assets.some(({ id }) => id === privatePhoto.id || id === outsiderPhoto.id)).toBe(false);
  });

  it('starts with an empty manifest for a new single-person household', async () => {
    const { user } = await ctx.newUser();
    const manifest = await sync.getManifest(user.id);
    const stored = await db
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    expect(manifest.householdId).toBe(stored.householdId);
    expect(manifest.version).toBe(1);
    expect(manifest.assets).toEqual([]);
    expect(manifest.albums).toEqual([]);
    expect(manifest.albumAssets).toEqual([]);
  });

  it('automatically includes existing publications for a newly accepted household member', async () => {
    const { user: owner } = await ctx.newUser();
    const { user: invited } = await ctx.newUser();
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    const { album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Existing' }, [asset.id]);
    await albums.publishAlbum(owner.id, album.id, Mode.Share);
    const beforeJoin = await sync.getManifest(invited.id);
    expect(beforeJoin.assets).toEqual([]);
    await users.moveToHouseholdOf(invited.id, owner.id);
    const afterJoin = await sync.getManifest(invited.id);
    expect(afterJoin.assets.map(({ id }) => id)).toEqual([asset.id]);
    expect(afterJoin.albums.map(({ id }) => id)).toEqual([album.id]);
    expect(afterJoin.albumAssets).toEqual([{ albumId: album.id, assetId: asset.id }]);
  });

  it('reconciles album membership removals without revoking an independently shared photo', async () => {
    const { owner, member } = await family();
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    const { album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Events' }, [asset.id]);
    await albums.publishAlbum(owner.id, album.id, Mode.Share);
    await db.deleteFrom('album_asset').where('albumId', '=', album.id).where('assetId', '=', asset.id).execute();
    const manifest = await sync.getManifest(member.id);
    expect(manifest.assets.map(({ id }) => id)).toEqual([asset.id]);
    expect(manifest.albums.map(({ id }) => id)).toEqual([album.id]);
    expect(manifest.albumAssets).toEqual([]);
  });

  it('removes withdrawn photos and stale album links from the next manifest without deleting originals', async () => {
    const { owner, member } = await family();
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    const { album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Family' }, [asset.id]);
    const original = await db
      .selectFrom('asset')
      .select('originalPath')
      .where('id', '=', asset.id)
      .executeTakeFirstOrThrow();
    await albums.publishAlbum(owner.id, album.id, Mode.Share);

    const before = await sync.getManifest(member.id);
    expect(before.assets.map(({ id }) => id)).toEqual([asset.id]);
    expect(before.albumAssets).toEqual([{ albumId: album.id, assetId: asset.id }]);

    await photos.publish(owner.id, [asset.id], Mode.Private);
    const after = await sync.getManifest(member.id);
    expect(after.assets).toEqual([]);
    expect(after.albumAssets).toEqual([]);
    expect(after.albums).toHaveLength(1);
    expect(
      await db.selectFrom('asset').select('originalPath').where('id', '=', asset.id).executeTakeFirstOrThrow(),
    ).toEqual(original);
  });

  it('excludes locked photos even when a stale publication record exists', async () => {
    const { owner, member } = await family();
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await photos.publish(owner.id, [asset.id], Mode.Share);
    await db.updateTable('asset').set({ visibility: AssetVisibility.Locked }).where('id', '=', asset.id).execute();
    const manifest = await sync.getManifest(member.id);
    expect(manifest.assets).toEqual([]);
  });

  it('immediately revokes former-family photo and album access after membership changes', async () => {
    const { owner, member } = await family();
    const { asset: ownerPhoto } = await ctx.newAsset({ ownerId: owner.id });
    const { asset: memberPhoto } = await ctx.newAsset({ ownerId: member.id });
    const { album } = await ctx.newAlbum({ ownerId: member.id, albumName: 'Leaving' }, [memberPhoto.id]);
    await photos.publish(owner.id, [ownerPhoto.id], Mode.Share);
    await albums.publishAlbum(member.id, album.id, Mode.Share);
    const beforeLeave = await sync.getManifest(owner.id);
    expect(beforeLeave.albums).toHaveLength(1);

    await users.moveToNewHousehold(member.id);

    const oldFamily = await sync.getManifest(owner.id);
    const newFamily = await sync.getManifest(member.id);
    expect(oldFamily.assets.map(({ id }) => id)).toEqual([ownerPhoto.id]);
    expect(oldFamily.albums).toEqual([]);
    expect(oldFamily.albumAssets).toEqual([]);
    expect(newFamily.assets).toEqual([]);
    expect(newFamily.albums).toEqual([]);
    expect(newFamily.albumAssets).toEqual([]);
    expect(await db.selectFrom('asset').select('id').where('id', '=', memberPhoto.id).executeTakeFirst()).toEqual({
      id: memberPhoto.id,
    });
  });

  it('does not expose unpublished or soft-deleted albums and their links', async () => {
    const { owner, member } = await family();
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    const { album: privateAlbum } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Private' }, [asset.id]);
    const { album: familyAlbum } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Deleted' }, [asset.id]);
    await albums.publishAlbum(owner.id, familyAlbum.id, Mode.Share);
    await db.updateTable('album').set({ deletedAt: new Date() }).where('id', '=', familyAlbum.id).execute();

    const manifest = await sync.getManifest(member.id);
    expect(manifest.assets.map(({ id }) => id)).toEqual([asset.id]);
    expect(manifest.albums).toEqual([]);
    expect(manifest.albumAssets).toEqual([]);
    expect(manifest.albums.some(({ id }) => id === privateAlbum.id)).toBe(false);
  });
});
