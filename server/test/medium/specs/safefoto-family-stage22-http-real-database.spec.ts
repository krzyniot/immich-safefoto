import { Kysely } from 'kysely';
import { FamilyPhotoController } from 'src/controllers/family-photo.controller';
import { AuthDto } from 'src/dtos/auth.dto';
import { FamilyPhotoPublicationMode } from 'src/dtos/family-photo.dto';
import { FamilyPhotoRepository } from 'src/repositories/family-photo.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { FamilyPhotoService } from 'src/services/family-photo.service';
import request from 'supertest';
import { SyncTestContext } from 'test/medium.factory';
import { ControllerContext, controllerSetup, getKyselyDB } from 'test/utils';

describe('SafeFoto HTTP family timeline with real isolated database', () => {
  let database: Kysely<DB>;
  let ctx: ControllerContext;
  let familyContext: SyncTestContext;
  let repository: FamilyPhotoRepository;
  let users: UserRepository;

  beforeAll(async () => {
    database = await getKyselyDB();
    familyContext = new SyncTestContext(database);
    repository = new FamilyPhotoRepository(database);
    users = new UserRepository(database);
    ctx = await controllerSetup(FamilyPhotoController, [
      { provide: FamilyPhotoService, useValue: new FamilyPhotoService(repository) },
    ]);
  });

  afterAll(async () => {
    await ctx?.close();
    await database?.destroy();
  });

  it('returns current family photos over HTTP and stops returning them after leaving', async () => {
    const { user: owner } = await familyContext.newUser();
    const { user: member } = await familyContext.newUser();
    const { user: outsider } = await familyContext.newUser();
    await users.moveToHouseholdOf(member.id, owner.id);
    const { asset } = await familyContext.newAsset({ ownerId: owner.id });
    await repository.publish(owner.id, [asset.id], FamilyPhotoPublicationMode.Share);

    // The HTTP guard uses synthetic identities only. The family membership
    // and photo selection are evaluated by the real Postgres repository.
    const identities = new Map([
      ['owner', owner.id],
      ['member', member.id],
      ['outsider', outsider.id],
    ]);
    ctx.authenticate.mockImplementation(({ headers }: { headers: Record<string, string> }) => {
      const key = headers.authorization?.replace('Bearer ', '');
      const userId = key && identities.get(key);
      if (!userId) {
        throw new Error('Test identity missing');
      }
      return Promise.resolve({ user: { id: userId } } as AuthDto);
    });

    const getPhotos = (identity: string) =>
      request(ctx.getHttpServer()).get('/family/photos?page=1&limit=50').set('Authorization', `Bearer ${identity}`);

    const memberBefore = await getPhotos('member');
    expect(memberBefore.status).toBe(200);
    expect(memberBefore.body.items).toEqual([expect.objectContaining({ id: asset.id })]);

    const outsiderResult = await getPhotos('outsider');
    expect(outsiderResult.status).toBe(200);
    expect(outsiderResult.body.items).toEqual([]);

    await users.moveToNewHousehold(member.id);
    const formerMember = await getPhotos('member');
    expect(formerMember.status).toBe(200);
    expect(formerMember.body.items).toEqual([]);

    const ownerStillHasPhotos = await getPhotos('owner');
    expect(ownerStillHasPhotos.status).toBe(200);
    expect(ownerStillHasPhotos.body.items).toEqual([expect.objectContaining({ id: asset.id })]);
  });
});
