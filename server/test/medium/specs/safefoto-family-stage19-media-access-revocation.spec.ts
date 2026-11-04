import { Kysely } from 'kysely';
import { AuthDto } from 'src/dtos/auth.dto';
import { FamilyPhotoPublicationMode } from 'src/dtos/family-photo.dto';
import { Permission } from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { FamilyPhotoRepository } from 'src/repositories/family-photo.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { requireAccess } from 'src/utils/access';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto family access revocation - 2026-11-04', () => {
  let db: Kysely<DB>;
  let ctx: SyncTestContext;
  let familyPhotos: FamilyPhotoRepository;
  let access: AccessRepository;
  let users: UserRepository;

  beforeAll(async () => {
    db = await getKyselyDB();
    ctx = new SyncTestContext(db);
    familyPhotos = new FamilyPhotoRepository(db);
    access = new AccessRepository(db);
    users = new UserRepository(db);
  });

  afterAll(async () => db.destroy());

  it('removes former-member photo metadata, thumbnails and original access after household change', async () => {
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, owner.id);

    const { asset } = await ctx.newAsset({ ownerId: owner.id });
    const ownerAuth = { user: { id: owner.id } } as AuthDto;
    const memberAuth = { user: { id: member.id } } as AuthDto;
    const outsiderAuth = { user: { id: outsider.id } } as AuthDto;

    await familyPhotos.publish(owner.id, [asset.id], FamilyPhotoPublicationMode.Share);

    for (const permission of [Permission.AssetRead, Permission.AssetView, Permission.AssetDownload]) {
      await expect(requireAccess(access, { auth: memberAuth, permission, ids: [asset.id] })).resolves.toBeUndefined();
      await expect(requireAccess(access, { auth: outsiderAuth, permission, ids: [asset.id] })).rejects.toThrow(
        'Not found or no',
      );
    }

    await users.moveToNewHousehold(member.id);

    for (const permission of [Permission.AssetRead, Permission.AssetView, Permission.AssetDownload]) {
      await expect(requireAccess(access, { auth: memberAuth, permission, ids: [asset.id] })).rejects.toThrow(
        'Not found or no',
      );
      await expect(requireAccess(access, { auth: ownerAuth, permission, ids: [asset.id] })).resolves.toBeUndefined();
    }
    await expect(familyPhotos.getPage(member.id, { page: 1, limit: 50 })).resolves.toMatchObject({ items: [] });
  });
});
