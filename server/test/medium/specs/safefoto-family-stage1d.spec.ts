import { Kysely } from 'kysely';
import { AlbumUserRole } from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AlbumUserRepository } from 'src/repositories/album-user.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { EventRepository } from 'src/repositories/event.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PartnerDirection, PartnerRepository } from 'src/repositories/partner.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { AlbumService } from 'src/services/album.service';
import { PartnerService } from 'src/services/partner.service';
import { UserService } from 'src/services/user.service';
import { newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';

let database: Kysely<DB>;

const userSetup = () =>
  newMediumService(UserService, {
    database,
    real: [UserRepository],
    mock: [LoggingRepository],
  });

const albumSetup = () =>
  newMediumService(AlbumService, {
    database,
    real: [AccessRepository, AlbumRepository, AlbumUserRepository, AssetRepository, UserRepository],
    mock: [EventRepository, LoggingRepository],
  });

const partnerSetup = () =>
  newMediumService(PartnerService, {
    database,
    real: [AccessRepository, PartnerRepository, UserRepository],
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

const getHouseholdId = async (userId: string) =>
  (await database.selectFrom('user').select('householdId').where('id', '=', userId).executeTakeFirstOrThrow())
    .householdId;

const moveToHouseholdId = async (userId: string, householdId: string) => {
  await database.updateTable('user').set({ householdId }).where('id', '=', userId).execute();
};

beforeAll(async () => {
  database = await getKyselyDB();
});

describe('SafeFoto household isolation - Stage 1D', () => {
  it('scopes discovery, direct profiles, and avatars to the requester household', async () => {
    const { sut, ctx } = userSetup();
    const { user: a1 } = await ctx.newUser();
    const { user: a2 } = await ctx.newUser({ profileImagePath: '/tmp/a2-profile.jpg' });
    const { user: b1 } = await ctx.newUser({ profileImagePath: '/tmp/b1-profile.jpg' });
    await moveToHousehold(a2.id, a1.id);
    const auth = factory.auth({ user: a1 });

    await expect(sut.search(auth)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: a1.id }), expect.objectContaining({ id: a2.id })]),
    );
    await expect(sut.search(auth)).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: b1.id })]),
    );
    await expect(sut.get(auth, a1.id)).resolves.toEqual(expect.objectContaining({ id: a1.id }));
    await expect(sut.get(auth, a2.id)).resolves.toEqual(expect.objectContaining({ id: a2.id }));
    await expect(sut.get(auth, b1.id)).rejects.toThrow();
    await expect(sut.getProfileImage(auth, a2.id)).resolves.toEqual(
      expect.objectContaining({ path: '/tmp/a2-profile.jpg' }),
    );
    await expect(sut.getProfileImage(auth, b1.id)).rejects.toThrow();

    const missingAuth = factory.auth({ user: { id: factory.uuid() } });
    await expect(sut.search(missingAuth)).resolves.toEqual([]);
    await expect(sut.get(missingAuth, a1.id)).rejects.toThrow();
  });

  it('allows same-household album membership and rejects foreign users atomically', async () => {
    const { sut, ctx } = albumSetup();
    ctx.getMock(EventRepository).emit.mockResolvedValue();
    const { user: a1 } = await ctx.newUser();
    const { user: a2 } = await ctx.newUser();
    const { user: b1 } = await ctx.newUser();
    const b1HouseholdId = await getHouseholdId(b1.id);
    await moveToHousehold(a2.id, a1.id);
    const auth = factory.auth({ user: a1 });

    await expect(
      sut.create(auth, { albumName: 'Household A', albumUsers: [{ userId: a2.id, role: AlbumUserRole.Editor }] }),
    ).resolves.toEqual(expect.objectContaining({ albumName: 'Household A' }));
    await expect(
      sut.create(auth, {
        albumName: 'Rejected album',
        albumUsers: [
          { userId: a2.id, role: AlbumUserRole.Editor },
          { userId: b1.id, role: AlbumUserRole.Editor },
        ],
      }),
    ).rejects.toThrow();
    await expect(
      sut.create(factory.auth({ user: { id: factory.uuid() } }), { albumName: 'Missing requester' }),
    ).rejects.toThrow();
    await expect(
      database
        .selectFrom('album')
        .select('id')
        .where('albumName', 'in', ['Rejected album', 'Missing requester'])
        .execute(),
    ).resolves.toEqual([]);

    const { album } = await ctx.newAlbum({ ownerId: a1.id, albumName: 'Membership checks' });
    await expect(sut.addUsers(auth, album.id, { albumUsers: [{ userId: a2.id }] })).resolves.toEqual(
      expect.objectContaining({ id: album.id }),
    );
    await expect(sut.addUsers(auth, album.id, { albumUsers: [{ userId: b1.id }] })).rejects.toThrow();

    await moveToHousehold(b1.id, a1.id);
    await ctx.newAlbumUser({ albumId: album.id, userId: b1.id, role: AlbumUserRole.Viewer });
    await moveToHouseholdId(b1.id, b1HouseholdId);
    const response = await sut.get(auth, album.id);
    expect(response.albumUsers.map(({ user }) => user.id)).toContain(a2.id);
    expect(response.albumUsers.map(({ user }) => user.id)).not.toContain(b1.id);
  });

  it('allows same-household partners and hides stale foreign partner rows', async () => {
    const { sut, ctx } = partnerSetup();
    const { user: a1 } = await ctx.newUser();
    const { user: a2 } = await ctx.newUser();
    const { user: b1 } = await ctx.newUser();
    const b1HouseholdId = await getHouseholdId(b1.id);
    await moveToHousehold(a2.id, a1.id);
    const auth = factory.auth({ user: a1 });

    await expect(sut.create(auth, { sharedWithId: a2.id })).resolves.toEqual(expect.objectContaining({ id: a2.id }));
    await expect(sut.create(auth, { sharedWithId: b1.id })).rejects.toThrow();
    await moveToHousehold(b1.id, a1.id);
    await ctx.newPartner({ sharedById: a1.id, sharedWithId: b1.id });
    await moveToHouseholdId(b1.id, b1HouseholdId);

    const partners = await sut.search(auth, { direction: PartnerDirection.SharedBy });
    expect(partners.map(({ id }) => id)).toContain(a2.id);
    expect(partners.map(({ id }) => id)).not.toContain(b1.id);
    await expect(sut.remove(auth, b1.id)).rejects.toThrow();
    await expect(sut.update(factory.auth({ user: b1 }), a1.id, { inTimeline: false })).rejects.toThrow();
  });

  it('does not treat stale album_user or partner rows as sufficient access', async () => {
    const { ctx } = albumSetup();
    const access = ctx.get(AccessRepository);
    const { user: a1 } = await ctx.newUser();
    const { user: a2 } = await ctx.newUser();
    const { user: b1 } = await ctx.newUser();
    const b1HouseholdId = await getHouseholdId(b1.id);
    await moveToHousehold(a2.id, a1.id);
    const { album } = await ctx.newAlbum({ ownerId: a1.id });
    const { asset } = await ctx.newAsset({ ownerId: a1.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    await ctx.newAlbumUser({ albumId: album.id, userId: a2.id, role: AlbumUserRole.Viewer });
    await moveToHousehold(b1.id, a1.id);
    await ctx.newAlbumUser({ albumId: album.id, userId: b1.id, role: AlbumUserRole.Viewer });
    await moveToHouseholdId(b1.id, b1HouseholdId);

    await expect(
      access.album.checkSharedAlbumAccess(a2.id, new Set([album.id]), AlbumUserRole.Viewer),
    ).resolves.toEqual(new Set([album.id]));
    await expect(
      access.album.checkSharedAlbumAccess(b1.id, new Set([album.id]), AlbumUserRole.Viewer),
    ).resolves.toEqual(new Set());
    await expect(access.asset.checkAlbumAccess(a2.id, new Set([asset.id]))).resolves.toEqual(new Set([asset.id]));
    await expect(access.asset.checkAlbumAccess(b1.id, new Set([asset.id]))).resolves.toEqual(new Set());

    await ctx.newPartner({ sharedById: a1.id, sharedWithId: a2.id });
    await moveToHousehold(b1.id, a1.id);
    await ctx.newPartner({ sharedById: a1.id, sharedWithId: b1.id });
    await moveToHouseholdId(b1.id, b1HouseholdId);
    await expect(access.partner.checkUpdateAccess(a2.id, new Set([a1.id]))).resolves.toEqual(new Set([a1.id]));
    await expect(access.partner.checkUpdateAccess(b1.id, new Set([a1.id]))).resolves.toEqual(new Set());
  });
});
