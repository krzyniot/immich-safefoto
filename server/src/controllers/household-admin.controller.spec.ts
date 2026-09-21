import { HouseholdAdminController } from 'src/controllers/household-admin.controller';
import { Permission } from 'src/enum';
import { UserAdminService } from 'src/services/user-admin.service';
import request from 'supertest';
import { factory } from 'test/small.factory';
import { ControllerContext, controllerSetup, mockBaseService } from 'test/utils';

describe(HouseholdAdminController.name, () => {
  let ctx: ControllerContext;
  const service = mockBaseService(UserAdminService);

  beforeAll(async () => {
    ctx = await controllerSetup(HouseholdAdminController, [{ provide: UserAdminService, useValue: service }]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.resetAllMocks();
    ctx.reset();
  });

  it('requires system admin and AdminUserUpdate permission, even for a household admin', async () => {
    await request(ctx.getHttpServer()).put(`/admin/households/${factory.uuid()}/storage-pool`)
      .send({ quotaSizeInBytes: 4 * 1024 ** 3 });
    expect(ctx.authenticate).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ adminRoute: true, permission: Permission.AdminUserUpdate }),
    }));
  });

  it('validates the pool and forwards the household ID to the service', async () => {
    const id = '01994d14-7677-7000-8000-000000000001'; // household IDs use UUIDv7
    const bad = await request(ctx.getHttpServer()).put(`/admin/households/${id}/storage-pool`)
      .send({ quotaSizeInBytes: 'untrusted' });
    expect(bad.status).toBe(400);
    expect(service.setHouseholdStoragePool).not.toHaveBeenCalled();

    const result = await request(ctx.getHttpServer()).put(`/admin/households/${id}/storage-pool`)
      .send({ quotaSizeInBytes: 4 * 1024 ** 3 });
    expect(result.status).toBe(204);
    expect(service.setHouseholdStoragePool).toHaveBeenCalledWith(id, { quotaSizeInBytes: 4 * 1024 ** 3 });
  });
});
