import { FamilyPhotoController } from 'src/controllers/family-photo.controller';
import { Permission } from 'src/enum';
import { FamilyPhotoService } from 'src/services/family-photo.service';
import request from 'supertest';
import { ControllerContext, controllerSetup } from 'test/utils';

describe('SafeFoto family photos HTTP contract', () => {
  let ctx: ControllerContext;
  const service = { getPhotos: vi.fn() };

  beforeAll(async () => {
    ctx = await controllerSetup(FamilyPhotoController, [{ provide: FamilyPhotoService, useValue: service }]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.getPhotos.mockReset();
    ctx.reset();
  });

  it('requires AssetRead permission for a family photo list', async () => {
    service.getPhotos.mockResolvedValue({ items: [], page: 1, limit: 50, nextPage: null });
    const result = await request(ctx.getHttpServer()).get('/family/photos?page=1&limit=50');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ items: [], page: 1, limit: 50, nextPage: null });
    expect(ctx.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ permission: Permission.AssetRead }) }),
    );
    expect(service.getPhotos).toHaveBeenCalledWith(undefined, { page: 1, limit: 50 });
  });

  it('rejects invalid pagination before querying the service', async () => {
    const result = await request(ctx.getHttpServer()).get('/family/photos?page=0&limit=101');
    expect(result.status).toBe(400);
    expect(service.getPhotos).not.toHaveBeenCalled();
  });
});
