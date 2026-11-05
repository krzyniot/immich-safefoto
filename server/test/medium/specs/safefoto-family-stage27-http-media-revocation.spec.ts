import { Kysely } from 'kysely';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssetMediaController } from 'src/controllers/asset-media.controller';
import { AuthDto } from 'src/dtos/auth.dto';
import { FamilyPhotoPublicationMode } from 'src/dtos/family-photo.dto';
import { AccessRepository } from 'src/repositories/access.repository';
import { FamilyPhotoRepository } from 'src/repositories/family-photo.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { AssetMediaService } from 'src/services/asset-media.service';
import request from 'supertest';
import { SyncTestContext } from 'test/medium.factory';
import { ControllerContext, controllerSetup, getKyselyDB } from 'test/utils';

describe('SafeFoto real HTTP media access revocation on isolated PostgreSQL - Stage27', () => {
  let db: Kysely<DB>;
  let ctx: ControllerContext;
  let factory: SyncTestContext;
  let users: UserRepository;
  let photos: FamilyPhotoRepository;
  let directory: string;
  let mediaPath: string;

  const identities = new Map<string, string>();

  beforeAll(async () => {
    db = await getKyselyDB();
    factory = new SyncTestContext(db);
    users = new UserRepository(db);
    photos = new FamilyPhotoRepository(db);
    directory = await mkdtemp(join(tmpdir(), 'safefoto-stage27-'));
    mediaPath = join(directory, 'family-fixture.png');
    await writeFile(
      mediaPath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+hXyQAAAAASUVORK5CYII=',
        'base64',
      ),
    );

    // Use actual AssetMediaService methods and PostgreSQL-backed AccessRepository.
    // Only the physical file lookup is stubbed to point at a disposable fixture.
    const service = Object.create(AssetMediaService.prototype) as AssetMediaService;
    Object.assign(service, {
      accessRepository: new AccessRepository(db),
      assetRepository: {
        getForOriginal: vi.fn().mockResolvedValue({
          originalPath: mediaPath,
          originalFileName: 'family-fixture.png',
          editedPath: null,
        }),
        getForThumbnail: vi.fn().mockResolvedValue({
          originalPath: mediaPath,
          originalFileName: 'family-fixture.png',
          path: mediaPath,
        }),
      },
    });

    ctx = await controllerSetup(AssetMediaController, [{ provide: AssetMediaService, useValue: service }]);
    ctx.authenticate.mockImplementation(({ headers }: { headers: Record<string, string> }) => {
      const name = headers.authorization?.replace('Bearer ', '');
      const id = name && identities.get(name);
      if (!id) {
        throw new Error('Unexpected test-only identity');
      }
      return Promise.resolve({ user: { id } } as AuthDto);
    });
  });

  afterAll(async () => {
    await ctx?.close();
    await db?.destroy();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  const getMedia = (identity: string, assetId: string, size: 'original' | 'thumbnail' | 'preview') => {
    const path = size === 'original' ? `/assets/${assetId}/original` : `/assets/${assetId}/thumbnail?size=${size}`;
    return request(ctx.getHttpServer()).get(path).set('Authorization', `Bearer ${identity}`);
  };

  const checkMedia = async (identity: string, assetId: string, expected: number) => {
    for (const size of ['original', 'thumbnail', 'preview'] as const) {
      const response = await getMedia(identity, assetId, size);
      if (expected === 200) {
        expect(response.status).toBe(200);
      } else {
        expect([400, 404]).toContain(response.status);
        expect(response.headers['content-type']).not.toContain('image/png');
      }
      if (expected === 200) {
        expect(response.headers['content-type']).toContain('image/png');
      }
    }
  };

  it('revokes original and both thumbnail sizes immediately after a family member leaves', async () => {
    const { user: owner } = await factory.newUser();
    const { user: member } = await factory.newUser();
    const { user: outsider } = await factory.newUser();
    identities.set('owner', owner.id);
    identities.set('member', member.id);
    identities.set('outsider', outsider.id);
    await users.moveToHouseholdOf(member.id, owner.id);
    const { asset } = await factory.newAsset({ ownerId: owner.id });
    await photos.publish(owner.id, [asset.id], FamilyPhotoPublicationMode.Share);

    await checkMedia('member', asset.id, 200);
    await checkMedia('outsider', asset.id, 400);

    await users.moveToNewHousehold(member.id);

    await checkMedia('member', asset.id, 400);
    await checkMedia('owner', asset.id, 200);
    const memberPage = await photos.getPage(member.id, { page: 1, limit: 50 });
    expect(memberPage.items).toEqual([]);
  });

  it('revokes all HTTP media representations after explicitly marking a photo private', async () => {
    const { user: owner } = await factory.newUser();
    const { user: member } = await factory.newUser();
    identities.set('owner', owner.id);
    identities.set('member', member.id);
    await users.moveToHouseholdOf(member.id, owner.id);
    const { asset } = await factory.newAsset({ ownerId: owner.id });
    await photos.publish(owner.id, [asset.id], FamilyPhotoPublicationMode.Share);

    await checkMedia('member', asset.id, 200);
    await photos.publish(owner.id, [asset.id], FamilyPhotoPublicationMode.Private);

    await checkMedia('member', asset.id, 400);
    await checkMedia('owner', asset.id, 200);
  });
});
