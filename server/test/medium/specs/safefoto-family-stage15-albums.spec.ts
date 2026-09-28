import { Kysely } from 'kysely';
import { FamilyPhotoPublicationMode as Mode } from 'src/dtos/family-photo.dto';
import { FamilyAlbumRepository } from 'src/repositories/family-album.repository';
import { FamilyPhotoRepository } from 'src/repositories/family-photo.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto family albums - Stage 15A', () => {
  let db: Kysely<DB>;
  let ctx: SyncTestContext;
  let albums: FamilyAlbumRepository;
  let photos: FamilyPhotoRepository;
  let users: UserRepository;

  beforeAll(async () => {
    db = await getKyselyDB();
    ctx = new SyncTestContext(db);
    albums = new FamilyAlbumRepository(db);
    photos = new FamilyPhotoRepository(db);
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

  it('publishes an owned album and all its own photos without copying files', async () => {
    const { owner, member, outsider } = await family();
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    const { album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Weekend' }, [asset.id]);
    const before = await db
      .selectFrom('asset')
      .select(['ownerId', 'originalPath'])
      .where('id', '=', asset.id)
      .executeTakeFirstOrThrow();

    await albums.publishAlbum(owner.id, album.id, Mode.Move);
    await albums.publishAlbum(owner.id, album.id, Mode.Move);

    expect(await albums.getAlbums(member.id)).toEqual([
      expect.objectContaining({ id: album.id, albumName: 'Weekend', defaultMode: Mode.Move }),
    ]);
    expect(await albums.getAlbums(outsider.id)).toEqual([]);
    const page1 = await albums.getAlbumPhotos(member.id, album.id, 1, 50);
    expect(page1.items).toEqual([expect.objectContaining({ id: asset.id, hideFromPersonalTimeline: true })]);
    const page2 = await albums.getAlbumPhotos(outsider.id, album.id, 1, 50);
    expect(page2.items).toEqual([]);
    expect(
      await db
        .selectFrom('asset')
        .select(['ownerId', 'originalPath'])
        .where('id', '=', asset.id)
        .executeTakeFirstOrThrow(),
    ).toEqual(before);
    expect(await db.selectFrom('family_album').selectAll().where('albumId', '=', album.id).execute()).toHaveLength(1);
    expect(await db.selectFrom('family_asset').selectAll().where('assetId', '=', asset.id).execute()).toHaveLength(1);
  });

  it('rejects publishing another owner album or an album containing foreign photos atomically', async () => {
    const { owner, member } = await family();
    const { asset: own } = await ctx.newAsset({ ownerId: owner.id });
    const { asset: foreign } = await ctx.newAsset({ ownerId: member.id });
    const { album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Mixed' }, [own.id, foreign.id]);

    await expect(albums.publishAlbum(member.id, album.id, Mode.Share)).rejects.toThrow();
    await expect(albums.publishAlbum(owner.id, album.id, Mode.Share)).rejects.toThrow('not publishable');
    expect(await db.selectFrom('family_album').selectAll().where('albumId', '=', album.id).execute()).toEqual([]);
    expect(
      await db.selectFrom('family_asset').selectAll().where('assetId', 'in', [own.id, foreign.id]).execute(),
    ).toEqual([]);
  });

  it('lets another family member explicitly contribute their own photos, but not foreign photos', async () => {
    const { owner, member, outsider } = await family();
    const { album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Together' });
    const { asset: memberPhoto } = await ctx.newAsset({ ownerId: member.id });
    const { asset: outsiderPhoto } = await ctx.newAsset({ ownerId: outsider.id });
    await albums.publishAlbum(owner.id, album.id, Mode.Share);

    await expect(albums.addPhotos(member.id, album.id, [memberPhoto.id, outsiderPhoto.id], Mode.Share)).rejects.toThrow(
      'not publishable',
    );
    const page3 = await albums.getAlbumPhotos(owner.id, album.id, 1, 50);
    expect(page3.items).toEqual([]);

    await albums.addPhotos(member.id, album.id, [memberPhoto.id], Mode.Share);
    await albums.addPhotos(member.id, album.id, [memberPhoto.id], Mode.Share);
    const page4 = await albums.getAlbumPhotos(owner.id, album.id, 1, 50);
    expect(page4.items).toEqual([expect.objectContaining({ id: memberPhoto.id, ownerId: member.id })]);
    await expect(albums.addPhotos(outsider.id, album.id, [outsiderPhoto.id], Mode.Share)).rejects.toThrow();
    expect(await db.selectFrom('album_asset').selectAll().where('albumId', '=', album.id).execute()).toHaveLength(1);
  });

  it('hides a photo removed from family publication without deleting it from its album', async () => {
    const { owner, member } = await family();
    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    const { album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Family' }, [asset.id]);
    await albums.publishAlbum(owner.id, album.id, Mode.Share);
    await photos.publish(owner.id, [asset.id], Mode.Private);

    const page5 = await albums.getAlbumPhotos(member.id, album.id, 1, 50);

    expect(page5.items).toEqual([]);
    expect(await db.selectFrom('album_asset').selectAll().where('albumId', '=', album.id).execute()).toHaveLength(1);
  });

  it('revokes published album access when its owner changes household', async () => {
    const { owner, member } = await family();
    const { asset } = await ctx.newAsset({ ownerId: member.id });
    const { album } = await ctx.newAlbum({ ownerId: member.id, albumName: 'Leaving' }, [asset.id]);
    await albums.publishAlbum(member.id, album.id, Mode.Share);
    await users.moveToNewHousehold(member.id);
    expect(await albums.getAlbums(owner.id)).toEqual([]);
    const page6 = await albums.getAlbumPhotos(owner.id, album.id, 1, 50);
    expect(page6.items).toEqual([]);
    expect(await db.selectFrom('family_album').selectAll().where('albumId', '=', album.id).execute()).toEqual([]);
  });
});
