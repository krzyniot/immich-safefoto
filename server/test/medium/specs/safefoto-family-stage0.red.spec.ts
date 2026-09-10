import { Kysely } from 'kysely';
import { AlbumUserRole, SyncEntityType, SyncRequestType } from 'src/enum';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let database: Kysely<DB>;

beforeAll(async () => {
  database = await getKyselyDB();
});

/**
 * Medium tests need the disposable Immich PostgreSQL test environment.
 * Household labels below are test semantics only; v3.0.1 has no household
 * projection yet. All four tests are expected to be RED on pristine upstream.
 */
describe('SafeFoto household isolation - Stage 0 medium red tests', () => {
  it('SF-FAM-007: UsersV1 for A1 must contain only Household A users', async () => {
    const ctx = new SyncTestContext(database);
    const { auth: a1Auth, user: a1 } = await ctx.newSyncAuthUser();
    const { user: a2 } = await ctx.newUser({ name: 'Household A Adult', email: 'a2@example.invalid' });
    const { user: b1 } = await ctx.newUser({ name: 'Household B Owner', email: 'b1@example.invalid' });
    const { user: b2 } = await ctx.newUser({ name: 'Household B Adult', email: 'b2@example.invalid' });

    const response = await ctx.syncStream(a1Auth, [SyncRequestType.UsersV1]);
    const userIds = response
      .filter(({ type }) => type === SyncEntityType.UserV1)
      .map(({ data }) => (data as { id: string }).id);

    expect(new Set(userIds)).toEqual(new Set([a1.id, a2.id]));
    expect(userIds).not.toEqual(expect.arrayContaining([b1.id, b2.id]));
  });

  it('SF-FAM-008: UsersV1 deletes must not enumerate a deleted Household B user to A1', async () => {
    const ctx = new SyncTestContext(database);
    const { auth: a1Auth } = await ctx.newSyncAuthUser();
    const { user: b1 } = await ctx.newUser({ name: 'Household B Owner', email: 'b1@example.invalid' });

    const initial = await ctx.syncStream(a1Auth, [SyncRequestType.UsersV1]);
    await ctx.syncAckAll(a1Auth, initial);
    await ctx.get(UserRepository).delete({ id: b1.id }, true);

    const response = await ctx.syncStream(a1Auth, [SyncRequestType.UsersV1]);
    const deletedUserIds = response
      .filter(({ type }) => type === SyncEntityType.UserDeleteV1)
      .map(({ data }) => (data as { userId: string }).userId);

    expect(deletedUserIds).not.toContain(b1.id);
  });

  it('SF-FAM-009: a stale cross-household album_user must not grant album read/sync', async () => {
    const ctx = new SyncTestContext(database);
    const { auth: b1Auth, user: b1 } = await ctx.newSyncAuthUser();
    const { user: a1 } = await ctx.newUser({ name: 'Household A Owner', email: 'a1@example.invalid' });
    const { album } = await ctx.newAlbum({ ownerId: a1.id });
    await ctx.newAlbumUser({ albumId: album.id, userId: b1.id, role: AlbumUserRole.Viewer });

    const response = await ctx.syncStream(b1Auth, [SyncRequestType.AlbumsV1]);
    const albumIds = response
      .filter(({ type }) => type === SyncEntityType.AlbumV1)
      .map(({ data }) => (data as { id: string }).id);

    expect(albumIds).not.toContain(album.id);
  });

  it('SF-FAM-010: a stale cross-household album_user must not grant asset sync', async () => {
    const ctx = new SyncTestContext(database);
    const { auth: b1Auth, user: b1 } = await ctx.newSyncAuthUser();
    const { user: a1 } = await ctx.newUser({ name: 'Household A Owner', email: 'a1@example.invalid' });
    const { asset } = await ctx.newAsset({ ownerId: a1.id });
    const { album } = await ctx.newAlbum({ ownerId: a1.id }, [asset.id]);
    await ctx.newAlbumUser({ albumId: album.id, userId: b1.id, role: AlbumUserRole.Viewer });

    const response = await ctx.syncStream(b1Auth, [SyncRequestType.AlbumAssetsV2]);
    const assetIds = response
      .filter(({ type }) => type === SyncEntityType.AlbumAssetCreateV2 || type === SyncEntityType.AlbumAssetUpdateV2)
      .map(({ data }) => (data as { id: string }).id);

    expect(assetIds).not.toContain(asset.id);
  });
});
