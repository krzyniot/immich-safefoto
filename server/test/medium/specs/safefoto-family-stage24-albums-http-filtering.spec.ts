import { Kysely } from 'kysely';
import { FamilyAlbumController } from 'src/controllers/family-album.controller';
import { AuthDto } from 'src/dtos/auth.dto';
import { FamilyPhotoPublicationMode } from 'src/dtos/family-photo.dto';
import { FamilyAlbumRepository } from 'src/repositories/family-album.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { FamilyAlbumService } from 'src/services/family-album.service';
import request from 'supertest';
import { SyncTestContext } from 'test/medium.factory';
import { ControllerContext, controllerSetup, getKyselyDB } from 'test/utils';

describe('SafeFoto family album HTTP filtering on isolated PostgreSQL - Stage24', () => {
  let db: Kysely<DB>;
  let ctx: ControllerContext;
  let factory: SyncTestContext;
  let albums: FamilyAlbumRepository;
  let users: UserRepository;

  beforeAll(async () => {
    db = await getKyselyDB();
    factory = new SyncTestContext(db);
    albums = new FamilyAlbumRepository(db);
    users = new UserRepository(db);
    ctx = await controllerSetup(FamilyAlbumController, [
      { provide: FamilyAlbumService, useValue: new FamilyAlbumService(albums) },
    ]);
  });

  afterAll(async () => {
    await ctx?.close();
    await db?.destroy();
  });

  it('filters two published albums by ID and revokes both when a member leaves', async () => {
    const { user: owner } = await factory.newUser();
    const { user: member } = await factory.newUser();
    const { user: outsider } = await factory.newUser();
    await users.moveToHouseholdOf(member.id, owner.id);

    const { asset: firstPhoto } = await factory.newAsset({ ownerId: owner.id });
    const { asset: secondPhoto } = await factory.newAsset({ ownerId: owner.id });
    const { album: firstAlbum } = await factory.newAlbum(
      { ownerId: owner.id, albumName: 'First family album' },
      [firstPhoto.id],
    );
    const { album: secondAlbum } = await factory.newAlbum(
      { ownerId: owner.id, albumName: 'Second family album' },
      [secondPhoto.id],
    );
    await albums.publishAlbum(owner.id, firstAlbum.id, FamilyPhotoPublicationMode.Share);
    await albums.publishAlbum(owner.id, secondAlbum.id, FamilyPhotoPublicationMode.Share);

    const identities = new Map([
      ['owner', owner.id],
      ['member', member.id],
      ['outsider', outsider.id],
    ]);
    ctx.authenticate.mockImplementation(({ headers }: { headers: Record<string, string> }) => {
      const name = headers.authorization?.replace('Bearer ', '');
      const userId = name && identities.get(name);
      if (!userId) {
        throw new Error('Unexpected test-only identity');
      }
      return Promise.resolve({ user: { id: userId } } as AuthDto);
    });

    const getAlbums = (identity: string) =>
      request(ctx.getHttpServer()).get('/family/albums').set('Authorization', `Bearer ${identity}`);
    const getPhotos = (identity: string, albumId: string) =>
      request(ctx.getHttpServer())
        .get(`/family/albums/${albumId}/photos?page=1&limit=50`)
        .set('Authorization', `Bearer ${identity}`);

    const memberAlbums = await getAlbums('member');
    expect(memberAlbums.status).toBe(200);
    expect(memberAlbums.body.map((album: { id: string }) => album.id).sort()).toEqual(
      [firstAlbum.id, secondAlbum.id].sort(),
    );

    const first = await getPhotos('member', firstAlbum.id);
    const second = await getPhotos('member', secondAlbum.id);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.items.map((photo: { id: string }) => photo.id)).toEqual([firstPhoto.id]);
    expect(second.body.items.map((photo: { id: string }) => photo.id)).toEqual([secondPhoto.id]);

    const outsiderAlbums = await getAlbums('outsider');
    const outsiderPhotos = await getPhotos('outsider', firstAlbum.id);
    expect(outsiderAlbums.body).toEqual([]);
    expect(outsiderPhotos.body.items).toEqual([]);

    await users.moveToNewHousehold(member.id);

    const formerMemberAlbums = await getAlbums('member');
    const formerMemberFirst = await getPhotos('member', firstAlbum.id);
    const formerMemberSecond = await getPhotos('member', secondAlbum.id);
    const ownerAlbums = await getAlbums('owner');
    const ownerFirst = await getPhotos('owner', firstAlbum.id);
    expect(formerMemberAlbums.body).toEqual([]);
    expect(formerMemberFirst.body.items).toEqual([]);
    expect(formerMemberSecond.body.items).toEqual([]);
    expect(ownerAlbums.body).toHaveLength(2);
    expect(ownerFirst.body.items).toEqual([
      expect.objectContaining({ id: firstPhoto.id }),
    ]);
  });
});
