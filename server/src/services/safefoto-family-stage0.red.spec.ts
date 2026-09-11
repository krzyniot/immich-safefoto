import { AlbumUserRole } from 'src/enum';
import { AlbumService } from 'src/services/album.service';
import { PartnerService } from 'src/services/partner.service';
import { UserService } from 'src/services/user.service';
import { AlbumUserFactory } from 'test/factories/album-user.factory';
import { AlbumFactory } from 'test/factories/album.factory';
import { AuthFactory } from 'test/factories/auth.factory';
import { PartnerFactory } from 'test/factories/partner.factory';
import { UserFactory } from 'test/factories/user.factory';
import { getForAlbum, getForPartner } from 'test/mappers';
import { newTestService } from 'test/utils';

/**
 * Stage 0 characterization tests for SafeFoto's required household boundary.
 *
 * These tests preserve the RED baseline from pristine Immich v3.0.1. They
 * must not be weakened; Stage 1 makes them green through server enforcement.
 */
describe('SafeFoto household isolation - Stage 0 red tests', () => {
  const householdAId = '00000000-0000-4000-8000-00000000000a';
  const householdBId = '00000000-0000-4000-8000-00000000000b';
  const householdA = {
    a1: UserFactory.create({ householdId: householdAId, name: 'Household A Owner', email: 'a1@example.invalid' }),
    a2: UserFactory.create({ householdId: householdAId, name: 'Household A Adult', email: 'a2@example.invalid' }),
  };
  const householdB = {
    b1: UserFactory.create({ householdId: householdBId, name: 'Household B Owner', email: 'b1@example.invalid' }),
    b2: UserFactory.create({ householdId: householdBId, name: 'Household B Adult', email: 'b2@example.invalid' }),
  };

  it('SF-FAM-001: A1 user discovery must not return B1 or B2', async () => {
    const { sut, mocks } = newTestService(UserService);
    mocks.user.getByHousehold.mockResolvedValue([householdA.a1, householdA.a2]);

    const users = await sut.search(AuthFactory.create(householdA.a1));
    const ids = users.map(({ id }) => id);

    expect(ids).toEqual(expect.arrayContaining([householdA.a1.id, householdA.a2.id]));
    expect(ids).not.toEqual(expect.arrayContaining([householdB.b1.id, householdB.b2.id]));
  });

  it('SF-FAM-002: A1 must not read B1 profile by UUID', async () => {
    const { sut, mocks } = newTestService(UserService);
    mocks.user.getInHousehold.mockImplementation((_userId, targetUserId) =>
      Promise.resolve(targetUserId === householdA.a1.id ? householdA.a1 : void 0),
    );

    await expect(sut.get(AuthFactory.create(householdA.a1), householdB.b1.id)).rejects.toThrow();
  });

  it('SF-FAM-003: A1 must not read B1 profile image by UUID', async () => {
    const { sut, mocks } = newTestService(UserService);
    mocks.user.getInHousehold.mockResolvedValue(void 0);

    await expect(sut.getProfileImage(AuthFactory.create(householdA.a1), householdB.b1.id)).rejects.toThrow();
  });

  it('SF-FAM-004: A1 must not create an album shared with B1', async () => {
    const { sut, mocks } = newTestService(AlbumService);
    const album = AlbumFactory.from()
      .owner(householdA.a1)
      .albumUser({ userId: householdB.b1.id, role: AlbumUserRole.Editor }, (builder) => builder.user(householdB.b1))
      .build();

    mocks.user.getInHousehold.mockImplementation((_userId, targetUserId) =>
      Promise.resolve(targetUserId === householdA.a1.id ? householdA.a1 : void 0),
    );
    mocks.user.getMetadata.mockResolvedValue([]);
    mocks.album.create.mockResolvedValue(getForAlbum(album));

    await expect(
      sut.create(AuthFactory.create(householdA.a1), {
        albumName: 'A private album',
        albumUsers: [{ userId: householdB.b1.id, role: AlbumUserRole.Editor }],
      }),
    ).rejects.toThrow();
  });

  it('SF-FAM-005: A1 must not add B1 to an existing album', async () => {
    const { sut, mocks } = newTestService(AlbumService);
    const album = AlbumFactory.from().owner(householdA.a1).build();
    mocks.access.album.checkOwnerAccess.mockResolvedValue(new Set([album.id]));
    mocks.album.getById.mockResolvedValue(getForAlbum(album));
    mocks.user.getInHousehold.mockResolvedValue(void 0);
    mocks.albumUser.create.mockResolvedValue(
      AlbumUserFactory.from({ role: AlbumUserRole.Editor }).album(album).user(householdB.b1).build(),
    );

    await expect(
      sut.addUsers(AuthFactory.create(householdA.a1), album.id, {
        albumUsers: [{ userId: householdB.b1.id, role: AlbumUserRole.Editor }],
      }),
    ).rejects.toThrow();
  });

  it('SF-FAM-006: A1 must not create partner sharing with B1', async () => {
    const { sut, mocks } = newTestService(PartnerService);
    const partner = PartnerFactory.from().sharedBy(householdA.a1).sharedWith(householdB.b1).build();
    mocks.user.getInHousehold.mockResolvedValue(void 0);
    mocks.partner.get.mockResolvedValue(void 0);
    mocks.partner.create.mockResolvedValue(getForPartner(partner));

    await expect(sut.create(AuthFactory.create(householdA.a1), { sharedWithId: householdB.b1.id })).rejects.toThrow();
  });
});
