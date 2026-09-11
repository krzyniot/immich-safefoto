import { Kysely } from 'kysely';
import { AlbumUserRole, SyncEntityType } from 'src/enum';
import { SyncRepository } from 'src/repositories/sync.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

const maximumUpdateId = 'ffffffff-ffff-7fff-bfff-ffffffffffff';

const collect = async <T>(stream: AsyncIterableIterator<T>) => {
  const rows: T[] = [];
  for await (const row of stream) {
    rows.push(row);
  }
  return rows;
};

describe('SafeFoto household-aware album sync', () => {
  let database: Kysely<DB>;
  let ctx: SyncTestContext;
  let sync: SyncRepository;

  const queryOptions = (userId: string) => ({ nowId: maximumUpdateId, userId });
  const backfillOptions = { nowId: maximumUpdateId, beforeUpdateId: maximumUpdateId };

  beforeAll(async () => {
    database = await getKyselyDB();
    ctx = new SyncTestContext(database);
    sync = new SyncRepository(database);
  });

  afterAll(async () => {
    await database.destroy();
  });

  it('allows a member album in the same household and denies a stale cross-household membership', async () => {
    const { user: requester } = await ctx.newUser();
    const { user: owner } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
    await ctx.moveUserToHouseholdOf(owner.id, requester.id);
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    await ctx.newAlbumUser({ albumId: album.id, userId: requester.id, role: AlbumUserRole.Viewer });
    await ctx.newAlbumUser({ albumId: album.id, userId: outsider.id, role: AlbumUserRole.Viewer });

    await expect(collect(sync.album.getUpserts(queryOptions(requester.id)))).resolves.toEqual([
      expect.objectContaining({ id: album.id }),
    ]);
    await expect(collect(sync.album.getUpserts(queryOptions(outsider.id)))).resolves.toEqual([]);
    await expect(sync.album.getCreatedAfter(queryOptions(requester.id))).resolves.toEqual([
      expect.objectContaining({ id: album.id }),
    ]);
    await expect(sync.album.getCreatedAfter(queryOptions(outsider.id))).resolves.toEqual([]);
    await expect(sync.album.getAlbumUsers(album.id, requester.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: requester.id }),
        expect.objectContaining({ userId: owner.id }),
      ]),
    );
    const albumUsers = await sync.album.getAlbumUsers(album.id, requester.id);
    expect(albumUsers.map(({ userId }) => userId)).not.toContain(outsider.id);
  });

  it('fails closed for a missing requester, missing owner, and cross-household owner', async () => {
    const { user: requester } = await ctx.newUser();
    const { user: foreignOwner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: foreignOwner.id });
    await ctx.newAlbumUser({ albumId: album.id, userId: requester.id, role: AlbumUserRole.Viewer });

    await expect(collect(sync.album.getUpserts(queryOptions(requester.id)))).resolves.toEqual([]);
    await expect(collect(sync.album.getUpserts(queryOptions('ffffffff-ffff-4fff-8fff-ffffffffffff')))).resolves.toEqual(
      [],
    );

    await database
      .deleteFrom('album_user')
      .where('albumId', '=', album.id)
      .where('role', '=', AlbumUserRole.Owner)
      .execute();
    await ctx.moveUserToHouseholdOf(foreignOwner.id, requester.id);

    await expect(collect(sync.album.getUpserts(queryOptions(requester.id)))).resolves.toEqual([]);
  });

  it('allows same-household album assets and denies stale memberships and foreign-owned assets', async () => {
    const { user: requester } = await ctx.newUser();
    const { user: owner } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
    await ctx.moveUserToHouseholdOf(owner.id, requester.id);

    const { asset: allowedAsset } = await ctx.newAsset({ ownerId: owner.id });
    const { asset: foreignAsset } = await ctx.newAsset({ ownerId: outsider.id });
    await ctx.newExif({ assetId: allowedAsset.id, make: 'SafeFoto Stage 1C' });
    await ctx.newExif({ assetId: foreignAsset.id, make: 'SafeFoto Stage 1C' });
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    await ctx.newAlbumUser({ albumId: album.id, userId: requester.id, role: AlbumUserRole.Viewer });
    await ctx.newAlbumUser({ albumId: album.id, userId: outsider.id, role: AlbumUserRole.Viewer });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: allowedAsset.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: foreignAsset.id });

    const assetAck = { type: SyncEntityType.AlbumToAssetV1, updateId: maximumUpdateId };
    const requesterStreams = [
      await collect(sync.albumAsset.getCreates(queryOptions(requester.id))),
      await collect(sync.albumAsset.getUpdates(queryOptions(requester.id), assetAck)),
      await collect(sync.albumAssetExif.getCreates(queryOptions(requester.id))),
      await collect(sync.albumAssetExif.getUpdates(queryOptions(requester.id), assetAck)),
      await collect(sync.albumToAsset.getUpserts(queryOptions(requester.id))),
    ];
    const outsiderStreams = [
      await collect(sync.albumAsset.getCreates(queryOptions(outsider.id))),
      await collect(sync.albumAsset.getUpdates(queryOptions(outsider.id), assetAck)),
      await collect(sync.albumAssetExif.getCreates(queryOptions(outsider.id))),
      await collect(sync.albumAssetExif.getUpdates(queryOptions(outsider.id), assetAck)),
      await collect(sync.albumToAsset.getUpserts(queryOptions(outsider.id))),
    ];

    for (const rows of requesterStreams) {
      const assetIds = rows.map((row) => ('assetId' in row ? row.assetId : row.id));
      expect(assetIds).toContain(allowedAsset.id);
      expect(assetIds).not.toContain(foreignAsset.id);
    }
    for (const rows of outsiderStreams) {
      expect(rows).toEqual([]);
    }
  });

  it('applies household validation to every album-asset backfill path', async () => {
    const { user: requester } = await ctx.newUser();
    const { user: owner } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
    await ctx.moveUserToHouseholdOf(owner.id, requester.id);

    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newExif({ assetId: asset.id, make: 'SafeFoto Stage 1C' });
    const { album } = await ctx.newAlbum({ ownerId: owner.id }, [asset.id]);
    await ctx.newAlbumUser({ albumId: album.id, userId: requester.id, role: AlbumUserRole.Viewer });
    await ctx.newAlbumUser({ albumId: album.id, userId: outsider.id, role: AlbumUserRole.Viewer });

    await expect(collect(sync.albumAsset.getBackfill(backfillOptions, album.id, requester.id))).resolves.toHaveLength(
      1,
    );
    await expect(
      collect(sync.albumAssetExif.getBackfill(backfillOptions, album.id, requester.id)),
    ).resolves.toHaveLength(1);
    await expect(collect(sync.albumToAsset.getBackfill(backfillOptions, album.id, requester.id))).resolves.toHaveLength(
      1,
    );

    await expect(collect(sync.albumAsset.getBackfill(backfillOptions, album.id, outsider.id))).resolves.toEqual([]);
    await expect(collect(sync.albumAssetExif.getBackfill(backfillOptions, album.id, outsider.id))).resolves.toEqual([]);
    await expect(collect(sync.albumToAsset.getBackfill(backfillOptions, album.id, outsider.id))).resolves.toEqual([]);
  });

  it('does not expose foreign household membership through album user sync', async () => {
    const { user: requester } = await ctx.newUser();
    const { user: owner } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
    await ctx.moveUserToHouseholdOf(owner.id, requester.id);
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    await ctx.newAlbumUser({ albumId: album.id, userId: requester.id, role: AlbumUserRole.Viewer });
    await ctx.newAlbumUser({ albumId: album.id, userId: outsider.id, role: AlbumUserRole.Viewer });

    const memberships = await collect(sync.albumUser.getUpserts(queryOptions(requester.id)));
    expect(new Set(memberships.map(({ userId }) => userId))).toEqual(new Set([requester.id, owner.id]));
    await expect(collect(sync.albumUser.getUpserts(queryOptions(outsider.id)))).resolves.toEqual([]);
  });
});
