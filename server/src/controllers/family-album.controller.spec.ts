import { FamilyAlbumController } from 'src/controllers/family-album.controller';
import { Permission } from 'src/enum';
import { FamilyAlbumService } from 'src/services/family-album.service';
import request from 'supertest';
import { factory } from 'test/small.factory';
import { ControllerContext, controllerSetup } from 'test/utils';

describe('SafeFoto family albums HTTP contract', () => {
  let ctx: ControllerContext;
  const service = { getAlbums: vi.fn(), getPhotos: vi.fn() };

  beforeAll(async () => {
    ctx = await controllerSetup(FamilyAlbumController, [{ provide: FamilyAlbumService, useValue: service }]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.getAlbums.mockReset();
    service.getPhotos.mockReset();
    ctx.reset();
  });

  it('requires AlbumRead and returns only service-approved albums', async () => {
    service.getAlbums.mockResolvedValue([]);
    const response = await request(ctx.getHttpServer()).get('/family/albums');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(ctx.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ permission: Permission.AlbumRead }) }),
    );
  });

  it('requires AssetRead for photos in a selected family album', async () => {
    const id = factory.uuid();
    service.getPhotos.mockResolvedValue({ items: [], page: 1, limit: 50, nextPage: null });
    const response = await request(ctx.getHttpServer()).get(`/family/albums/${id}/photos?page=1&limit=50`);
    expect(response.status).toBe(200);
    expect(ctx.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ permission: Permission.AssetRead }) }),
    );
    expect(service.getPhotos).toHaveBeenCalledWith(undefined, id, { page: 1, limit: 50 });
  });

  it('rejects invalid album ID or pagination before reading photo data', async () => {
    const wrongId = await request(ctx.getHttpServer()).get('/family/albums/not-a-uuid/photos');
    const wrongPage = await request(ctx.getHttpServer()).get(`/family/albums/${factory.uuid()}/photos?page=0`);
    expect(wrongId.status).toBe(400);
    expect(wrongPage.status).toBe(400);
    expect(service.getPhotos).not.toHaveBeenCalled();
  });
});
