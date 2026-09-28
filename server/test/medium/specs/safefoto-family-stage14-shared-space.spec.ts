import { Kysely } from 'kysely';
import { AuthDto } from 'src/dtos/auth.dto';
import { FamilyPhotoPublicationMode } from 'src/dtos/family-photo.dto';
import { Permission } from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { FamilyPhotoRepository } from 'src/repositories/family-photo.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { requireAccess } from 'src/utils/access';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

const ids = (id: string) => new Set([id]);

describe('SafeFoto family shared space - Stage 14', () => {
  let database: Kysely<DB>;
  let ctx: SyncTestContext;
  let familyPhotos: FamilyPhotoRepository;
  let access: AccessRepository;
  let assets: AssetRepository;
  let users: UserRepository;

  beforeAll(async () => {
    database = await getKyselyDB();
    ctx = new SyncTestContext(database);
    familyPhotos = new FamilyPhotoRepository(database);
    access = new AccessRepository(database);
    assets = new AssetRepository(database);
    users = new UserRepository(database);
  });

  afterAll(async () => {
    await database.destroy();
  });

  const family = async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    return { admin, member, outsider };
  };

  it('keeps a new asset private by default', async () => {
    const { admin, member } = await family();
    const { asset } = await ctx.newAsset({ ownerId: admin.id });

    await expect(
      database.selectFrom('family_asset').selectAll().where('assetId', '=', asset.id).execute(),
    ).resolves.toEqual([]);
    await expect(access.asset.checkFamilyAccess(member.id, ids(asset.id))).resolves.toEqual(new Set());
    await expect(familyPhotos.getPage(member.id, { page: 1, limit: 50 })).resolves.toMatchObject({ items: [] });
  });

  it('shares an owned asset without hiding it from the owner timeline', async () => {
    const { admin, member } = await family();
    const { asset } = await ctx.newAsset({ ownerId: admin.id });

    const before = await assets.getTimeBuckets({ userIds: [admin.id], requesterId: admin.id });
    await familyPhotos.publish(admin.id, [asset.id], FamilyPhotoPublicationMode.Share);
    const after = await assets.getTimeBuckets({ userIds: [admin.id], requesterId: admin.id });

    expect(after).toEqual(before);
    await expect(access.asset.checkFamilyAccess(member.id, ids(asset.id))).resolves.toEqual(ids(asset.id));
    const memberAuth = { user: { id: member.id } } as AuthDto;
    await expect(
      requireAccess(access, { auth: memberAuth, permission: Permission.AssetRead, ids: [asset.id] }),
    ).resolves.toBeUndefined();
    await expect(
      requireAccess(access, { auth: memberAuth, permission: Permission.AssetView, ids: [asset.id] }),
    ).resolves.toBeUndefined();
    await expect(
      requireAccess(access, { auth: memberAuth, permission: Permission.AssetDownload, ids: [asset.id] }),
    ).resolves.toBeUndefined();
    await expect(
      database
        .selectFrom('partner')
        .selectAll()
        .where((eb) => eb.or([eb('sharedById', '=', admin.id), eb('sharedWithId', '=', admin.id)]))
        .execute(),
    ).resolves.toEqual([]);
    await expect(
      database.selectFrom('album_asset').selectAll().where('assetId', '=', asset.id).execute(),
    ).resolves.toEqual([]);
    await expect(familyPhotos.getPage(member.id, { page: 1, limit: 50 })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: asset.id, ownerId: admin.id, hideFromPersonalTimeline: false })],
    });
  });

  it('moves an owned asset out of the personal timeline and into the family timeline', async () => {
    const { admin, member } = await family();
    const { asset } = await ctx.newAsset({ ownerId: admin.id });

    await familyPhotos.publish(admin.id, [asset.id], FamilyPhotoPublicationMode.Move);

    await expect(assets.getTimeBuckets({ userIds: [admin.id], requesterId: admin.id })).resolves.toEqual([]);
    await expect(familyPhotos.getPage(member.id, { page: 1, limit: 50 })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: asset.id, ownerId: admin.id, hideFromPersonalTimeline: true })],
    });
  });

  it('makes publication idempotent and private mode revokes family access', async () => {
    const { admin, member } = await family();
    const { asset } = await ctx.newAsset({ ownerId: admin.id });

    await familyPhotos.publish(admin.id, [asset.id, asset.id], FamilyPhotoPublicationMode.Share);
    await familyPhotos.publish(admin.id, [asset.id], FamilyPhotoPublicationMode.Share);
    await expect(
      database.selectFrom('family_asset').selectAll().where('assetId', '=', asset.id).execute(),
    ).resolves.toHaveLength(1);

    await familyPhotos.publish(admin.id, [asset.id], FamilyPhotoPublicationMode.Private);
    await familyPhotos.publish(admin.id, [asset.id], FamilyPhotoPublicationMode.Private);
    await expect(access.asset.checkFamilyAccess(member.id, ids(asset.id))).resolves.toEqual(new Set());
    await expect(
      database.selectFrom('family_asset').selectAll().where('assetId', '=', asset.id).execute(),
    ).resolves.toEqual([]);
    await expect(assets.getTimeBuckets({ userIds: [admin.id], requesterId: admin.id })).resolves.not.toEqual([]);
  });

  it('paginates the family timeline without duplicates', async () => {
    const { admin, member } = await family();
    const { asset: first } = await ctx.newAsset({ ownerId: admin.id });
    const { asset: second } = await ctx.newAsset({ ownerId: admin.id });
    await familyPhotos.publish(admin.id, [first.id, second.id], FamilyPhotoPublicationMode.Share);

    const page1 = await familyPhotos.getPage(member.id, { page: 1, limit: 1 });
    const page2 = await familyPhotos.getPage(member.id, { page: 2, limit: 1 });

    expect(page1.items).toHaveLength(1);
    expect(page1.nextPage).toBe(2);
    expect(page2.items).toHaveLength(1);
    expect(page2.nextPage).toBeNull();
    expect(page1.items[0].id).not.toBe(page2.items[0].id);
  });

  it('denies another household and rejects publication of a foreign asset', async () => {
    const { admin, member, outsider } = await family();
    const { asset } = await ctx.newAsset({ ownerId: admin.id });
    await familyPhotos.publish(admin.id, [asset.id], FamilyPhotoPublicationMode.Share);

    await expect(access.asset.checkFamilyAccess(member.id, ids(asset.id))).resolves.toEqual(ids(asset.id));
    await expect(access.asset.checkFamilyAccess(outsider.id, ids(asset.id))).resolves.toEqual(new Set());
    await expect(familyPhotos.getPage(outsider.id, { page: 1, limit: 50 })).resolves.toMatchObject({ items: [] });
    await expect(familyPhotos.publish(member.id, [asset.id], FamilyPhotoPublicationMode.Share)).rejects.toThrow(
      'no owner access',
    );
  });

  it('does not change ownership, quota usage, paths, or create asset copies', async () => {
    const { admin } = await family();
    const { asset } = await ctx.newAsset({ ownerId: admin.id });
    const userBefore = await database
      .selectFrom('user')
      .select(['quotaUsageInBytes', 'quotaSizeInBytes'])
      .where('id', '=', admin.id)
      .executeTakeFirstOrThrow();
    const assetBefore = await database
      .selectFrom('asset')
      .select(['ownerId', 'originalPath'])
      .where('id', '=', asset.id)
      .executeTakeFirstOrThrow();
    const countBefore = await database
      .selectFrom('asset')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('ownerId', '=', admin.id)
      .executeTakeFirstOrThrow();

    await familyPhotos.publish(admin.id, [asset.id], FamilyPhotoPublicationMode.Move);

    await expect(
      database
        .selectFrom('user')
        .select(['quotaUsageInBytes', 'quotaSizeInBytes'])
        .where('id', '=', admin.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual(userBefore);
    await expect(
      database
        .selectFrom('asset')
        .select(['ownerId', 'originalPath'])
        .where('id', '=', asset.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual(assetBefore);
    const countAfter = await database
      .selectFrom('asset')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('ownerId', '=', admin.id)
      .executeTakeFirstOrThrow();
    expect(Number(countAfter.count)).toBe(Number(countBefore.count));
  });

  it('expires publications and access atomically when the owner leaves the household', async () => {
    const { admin, member } = await family();
    const { asset } = await ctx.newAsset({ ownerId: member.id });
    await familyPhotos.publish(member.id, [asset.id], FamilyPhotoPublicationMode.Share);
    await expect(access.asset.checkFamilyAccess(admin.id, ids(asset.id))).resolves.toEqual(ids(asset.id));

    await users.moveToNewHousehold(member.id);

    await expect(access.asset.checkFamilyAccess(admin.id, ids(asset.id))).resolves.toEqual(new Set());
    await expect(
      database.selectFrom('family_asset').selectAll().where('assetId', '=', asset.id).execute(),
    ).resolves.toEqual([]);
  });
});
