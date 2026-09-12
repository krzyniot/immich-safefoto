import { Kysely } from 'kysely';
import { randomBytes } from 'node:crypto';
import { ReactionType } from 'src/dtos/activity.dto';
import { AlbumUserRole, NotificationType, SharedLinkType } from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { ActivityRepository } from 'src/repositories/activity.repository';
import { AlbumUserRepository } from 'src/repositories/album-user.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { MapRepository } from 'src/repositories/map.repository';
import { NotificationRepository } from 'src/repositories/notification.repository';
import { PartnerRepository } from 'src/repositories/partner.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { SearchRepository } from 'src/repositories/search.repository';
import { SharedLinkAssetRepository } from 'src/repositories/shared-link-asset.repository';
import { SharedLinkRepository } from 'src/repositories/shared-link.repository';
import { StorageRepository } from 'src/repositories/storage.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { ActivityService } from 'src/services/activity.service';
import { NotificationService } from 'src/services/notification.service';
import { SearchService } from 'src/services/search.service';
import { SharedLinkService } from 'src/services/shared-link.service';
import { newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';

let database: Kysely<DB>;

const sharedLinkSetup = () =>
  newMediumService(SharedLinkService, {
    database,
    real: [
      AccessRepository,
      AlbumRepository,
      AssetRepository,
      DatabaseRepository,
      SharedLinkAssetRepository,
      SharedLinkRepository,
      UserRepository,
    ],
    mock: [CryptoRepository, LoggingRepository, StorageRepository],
  });

const activitySetup = () =>
  newMediumService(ActivityService, {
    database,
    real: [AccessRepository, ActivityRepository, AlbumRepository, AlbumUserRepository, AssetRepository, UserRepository],
    mock: [LoggingRepository],
  });

const notificationSetup = () =>
  newMediumService(NotificationService, {
    database,
    real: [AccessRepository, AlbumRepository, AlbumUserRepository, NotificationRepository, UserRepository],
    mock: [LoggingRepository],
  });

const searchSetup = () =>
  newMediumService(SearchService, {
    database,
    real: [
      AccessRepository,
      AlbumRepository,
      AlbumUserRepository,
      AssetRepository,
      PartnerRepository,
      PersonRepository,
      SearchRepository,
      UserRepository,
    ],
    mock: [LoggingRepository],
  });

const moveToHousehold = async (userId: string, householdMemberId: string) => {
  const { householdId } = await database
    .selectFrom('user')
    .select('householdId')
    .where('id', '=', householdMemberId)
    .executeTakeFirstOrThrow();
  await database.updateTable('user').set({ householdId }).where('id', '=', userId).execute();
};

beforeAll(async () => {
  database = await getKyselyDB();
});

describe('SafeFoto household isolation - Stage 1E', () => {
  it('allows safe shared links, rejects stale authenticated relations, and preserves public-link access', async () => {
    const { sut, ctx } = sharedLinkSetup();
    ctx.getMock(CryptoRepository).randomBytes.mockReturnValue(randomBytes(50));
    const { user: a1 } = await ctx.newUser();
    const { user: b1 } = await ctx.newUser();
    const { asset: ownAsset } = await ctx.newAsset({ ownerId: a1.id });
    const { asset: foreignAsset } = await ctx.newAsset({ ownerId: b1.id });
    await ctx.newExif({ assetId: ownAsset.id, make: 'SafeFoto' });
    await ctx.newExif({ assetId: foreignAsset.id, make: 'SafeFoto' });
    const auth = factory.auth({ user: a1 });

    await expect(sut.create(auth, { type: SharedLinkType.Individual, assetIds: [ownAsset.id] })).resolves.toMatchObject(
      { assets: [expect.objectContaining({ id: ownAsset.id })] },
    );

    await ctx.newPartner({ sharedById: b1.id, sharedWithId: a1.id });
    await expect(sut.create(auth, { type: SharedLinkType.Individual, assetIds: [foreignAsset.id] })).rejects.toThrow();

    const { album: foreignAlbum } = await ctx.newAlbum({ ownerId: b1.id });
    await ctx.newAlbumUser({ albumId: foreignAlbum.id, userId: a1.id, role: AlbumUserRole.Editor });
    await expect(sut.create(auth, { type: SharedLinkType.Album, albumId: foreignAlbum.id })).rejects.toThrow();

    const publicLink = await ctx.get(SharedLinkRepository).create({
      id: factory.uuid(),
      key: randomBytes(50),
      userId: b1.id,
      type: SharedLinkType.Individual,
      allowUpload: false,
      assetIds: [foreignAsset.id],
    });
    await expect(sut.getMine(factory.auth({ user: b1, sharedLink: publicLink }), [])).resolves.toMatchObject({
      assets: [expect.objectContaining({ id: foreignAsset.id })],
    });
  });

  it('filters foreign activity identities and denies stale cross-household activity access', async () => {
    const { sut, ctx } = activitySetup();
    const { user: a1 } = await ctx.newUser();
    const { user: a2 } = await ctx.newUser();
    const { user: b1 } = await ctx.newUser();
    await moveToHousehold(a2.id, a1.id);
    const { album } = await ctx.newAlbum({ ownerId: a1.id });
    await ctx.newAlbumUser({ albumId: album.id, userId: a2.id, role: AlbumUserRole.Viewer });
    await ctx.newAlbumUser({ albumId: album.id, userId: b1.id, role: AlbumUserRole.Viewer });

    await expect(
      sut.create(factory.auth({ user: a2 }), {
        albumId: album.id,
        type: ReactionType.COMMENT,
        comment: 'same household',
      }),
    ).resolves.toMatchObject({ value: expect.objectContaining({ user: expect.objectContaining({ id: a2.id }) }) });
    await ctx.get(ActivityRepository).create({
      albumId: album.id,
      userId: b1.id,
      assetId: null,
      isLiked: false,
      comment: 'must stay hidden',
    });

    const visible = await sut.getAll(factory.auth({ user: a1 }), { albumId: album.id });
    expect(visible.map(({ user }) => user.id)).toContain(a2.id);
    expect(visible.map(({ user }) => user.id)).not.toContain(b1.id);
    await expect(
      sut.create(factory.auth({ user: b1 }), {
        albumId: album.id,
        type: ReactionType.COMMENT,
        comment: 'foreign household',
      }),
    ).rejects.toThrow();
    await expect(sut.getAll(factory.auth({ user: b1 }), { albumId: album.id })).rejects.toThrow();
  });

  it('keeps notifications owner-scoped and hides stale foreign album payloads', async () => {
    const { sut, ctx } = notificationSetup();
    const { user: a1 } = await ctx.newUser();
    const { user: b1 } = await ctx.newUser();
    const { album: ownAlbum } = await ctx.newAlbum({ ownerId: a1.id });
    const { album: foreignAlbum } = await ctx.newAlbum({ ownerId: b1.id });
    const repository = ctx.get(NotificationRepository);
    const own = await repository.create({
      userId: a1.id,
      type: NotificationType.AlbumUpdate,
      title: 'Own album',
      data: { albumId: ownAlbum.id },
    });
    await repository.create({
      userId: a1.id,
      type: NotificationType.AlbumInvite,
      title: 'Stale foreign invite',
      data: { albumId: foreignAlbum.id, senderName: b1.name },
    });
    await repository.create({ userId: b1.id, type: NotificationType.SystemMessage, title: 'Other user' });

    const notifications = await sut.search(factory.auth({ user: a1 }), {});
    expect(notifications.map(({ id }) => id)).toEqual([own.id]);
  });

  it('filters foreign household assets from map markers', async () => {
    const { ctx } = activitySetup();
    const { user: a1 } = await ctx.newUser();
    const { user: a2 } = await ctx.newUser();
    const { user: b1 } = await ctx.newUser();
    await moveToHousehold(a2.id, a1.id);
    const { asset: aAsset } = await ctx.newAsset({ ownerId: a2.id });
    const { asset: bAsset } = await ctx.newAsset({ ownerId: b1.id });
    await ctx.newExif({ assetId: aAsset.id, latitude: 52, longitude: 21, city: 'Warsaw' });
    await ctx.newExif({ assetId: bAsset.id, latitude: 50, longitude: 19, city: 'Krakow' });
    const map = new MapRepository(
      undefined as never,
      undefined as never,
      LoggingRepository.create(),
      database as never,
    );

    const markers = await map.getMapMarkers(a1.id, [a1.id, a2.id, b1.id], [], [a1.id, a2.id], {});
    expect(markers.map(({ id }) => id)).toContain(aAsset.id);
    expect(markers.map(({ id }) => id)).not.toContain(bAsset.id);
  });

  it('keeps people owner-scoped and filters foreign assets from household-safe album search', async () => {
    const { sut, ctx } = searchSetup();
    const { user: a1 } = await ctx.newUser();
    const { user: a2 } = await ctx.newUser();
    const { user: b1 } = await ctx.newUser();
    await moveToHousehold(a2.id, a1.id);
    const { person: ownPerson } = await ctx.newPerson({ ownerId: a1.id, name: 'Alex' });
    await ctx.newPerson({ ownerId: b1.id, name: 'Alex' });
    const { album } = await ctx.newAlbum({ ownerId: a1.id });
    const { asset: aAsset } = await ctx.newAsset({ ownerId: a2.id });
    const { asset: bAsset } = await ctx.newAsset({ ownerId: b1.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: aAsset.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: bAsset.id });
    const auth = factory.auth({ user: a1 });

    await expect(sut.searchPerson(auth, { name: 'Alex' })).resolves.toEqual([
      expect.objectContaining({ id: ownPerson.id }),
    ]);
    const results = await sut.searchMetadata(auth, { albumIds: [album.id] });
    expect(results.assets.items.map(({ id }) => id)).toContain(aAsset.id);
    expect(results.assets.items.map(({ id }) => id)).not.toContain(bAsset.id);
  });

  it('denies stale album and partner media access while retaining valid public-link access', async () => {
    const { ctx } = activitySetup();
    const access = ctx.get(AccessRepository);
    const { user: a1 } = await ctx.newUser();
    const { user: b1 } = await ctx.newUser();
    const { asset } = await ctx.newAsset({ ownerId: b1.id });
    const { album } = await ctx.newAlbum({ ownerId: b1.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    await ctx.newAlbumUser({ albumId: album.id, userId: a1.id, role: AlbumUserRole.Viewer });
    await ctx.newPartner({ sharedById: b1.id, sharedWithId: a1.id });

    await expect(access.asset.checkAlbumAccess(a1.id, new Set([asset.id]))).resolves.toEqual(new Set());
    await expect(access.asset.checkPartnerAccess(a1.id, new Set([asset.id]))).resolves.toEqual(new Set());

    const publicLink = await ctx.get(SharedLinkRepository).create({
      id: factory.uuid(),
      key: randomBytes(50),
      userId: b1.id,
      type: SharedLinkType.Individual,
      allowUpload: false,
      assetIds: [asset.id],
    });
    await expect(access.asset.checkSharedLinkAccess(publicLink.id, new Set([asset.id]))).resolves.toEqual(
      new Set([asset.id]),
    );
  });
});
