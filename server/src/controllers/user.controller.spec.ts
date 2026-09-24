import { UserController } from 'src/controllers/user.controller';
import { Permission } from 'src/enum';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { UserService } from 'src/services/user.service';
import request from 'supertest';
import { errorDto } from 'test/medium/responses';
import { factory } from 'test/small.factory';
import { automock, ControllerContext, controllerSetup, mockBaseService } from 'test/utils';

describe(UserController.name, () => {
  let ctx: ControllerContext;
  const service = mockBaseService(UserService);

  beforeAll(async () => {
    ctx = await controllerSetup(UserController, [
      { provide: LoggingRepository, useValue: automock(LoggingRepository, { strict: false }) },
      { provide: UserService, useValue: service },
    ]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.resetAllMocks();
    ctx.reset();
  });

  describe('GET /users', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).get('/users');
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });

  describe('GET /users/me', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).get('/users/me');
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });

  describe('GET /users/me/household', () => {
    it('authenticates without accepting an arbitrary user ID', async () => {
      await request(ctx.getHttpServer()).get('/users/me/household');
      expect(ctx.authenticate).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ permission: Permission.UserRead }),
      }));
      expect(service.getOwnHouseholdSummary).toHaveBeenCalledWith(undefined);
    });
  });

  describe('GET /users/me/household/members', () => {
    it('uses the authenticated user identity only', async () => {
      await request(ctx.getHttpServer()).get('/users/me/household/members');
      expect(ctx.authenticate).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ permission: Permission.UserRead }),
      }));
      expect(service.getOwnHouseholdMembers).toHaveBeenCalledWith(undefined);
    });
  });

  describe('SafeFoto household invitation routes', () => {
    it('lists outgoing invitations for the authenticated user', async () => {
      await request(ctx.getHttpServer()).get('/users/me/household/invitations/outgoing');
      expect(ctx.authenticate).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ permission: Permission.UserRead }),
      }));
      expect(service.listOwnOutgoingHouseholdInvitations).toHaveBeenCalledWith(undefined);
    });

    it('lists incoming invitations for the authenticated user', async () => {
      await request(ctx.getHttpServer()).get('/users/me/household/invitations/incoming');
      expect(ctx.authenticate).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ permission: Permission.UserRead }),
      }));
      expect(service.listOwnIncomingHouseholdInvitations).toHaveBeenCalledWith(undefined);
    });

    it('validates email before creating an invitation', async () => {
      const bad = await request(ctx.getHttpServer()).post('/users/me/household/invitations').send({ email: 'bad' });
      expect(bad.status).toBe(400);
      expect(service.createOwnHouseholdInvitation).not.toHaveBeenCalled();

      const dto = { email: 'family@example.test' };
      await request(ctx.getHttpServer()).post('/users/me/household/invitations').send(dto);
      expect(ctx.authenticate).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ permission: Permission.UserUpdate }),
      }));
      expect(service.createOwnHouseholdInvitation).toHaveBeenCalledWith(undefined, dto);
    });

    it('accepts rejects and cancels only UUID invitation ids', async () => {
      const id = factory.uuid();
      await request(ctx.getHttpServer()).post(`/users/me/household/invitations/${id}/accept`);
      expect(service.acceptOwnHouseholdInvitation).toHaveBeenCalledWith(undefined, id);
      await request(ctx.getHttpServer()).post(`/users/me/household/invitations/${id}/reject`);
      expect(service.rejectOwnHouseholdInvitation).toHaveBeenCalledWith(undefined, id);
      await request(ctx.getHttpServer()).delete(`/users/me/household/invitations/${id}`);
      expect(service.cancelOwnHouseholdInvitation).toHaveBeenCalledWith(undefined, id);

      const bad = await request(ctx.getHttpServer()).post('/users/me/household/invitations/not-a-uuid/accept');
      expect(bad.status).toBe(400);
    });
  });

  describe('GET /users/me/household/admin', () => {
    it('returns the current household admin from authenticated context', async () => {
      await request(ctx.getHttpServer()).get('/users/me/household/admin');
      expect(ctx.authenticate).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ permission: Permission.UserRead }),
      }));
      expect(service.getOwnHouseholdAdmin).toHaveBeenCalledWith(undefined);
    });
  });

  describe('SafeFoto household administration routes', () => {
    it('transfers household administration to an explicit UUID successor', async () => {
      const successorId = factory.uuid();
      await request(ctx.getHttpServer()).post(`/users/me/household/admin-transfer/${successorId}`);
      expect(ctx.authenticate).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ permission: Permission.UserUpdate }),
      }));
      expect(service.transferOwnHouseholdAdmin).toHaveBeenCalledWith(undefined, successorId);

      const bad = await request(ctx.getHttpServer()).post('/users/me/household/admin-transfer/not-a-uuid');
      expect(bad.status).toBe(400);
    });

    it('leaves the current household through authenticated user context only', async () => {
      await request(ctx.getHttpServer()).post('/users/me/household/leave');
      expect(ctx.authenticate).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ permission: Permission.UserUpdate }),
      }));
      expect(service.leaveOwnHousehold).toHaveBeenCalledWith(undefined);
    });
  });

  describe('PUT /users/me/household/quota', () => {
    it('requires user-update permission and forwards validated allocation', async () => {
      const dto = { quotaSizeInBytes: 4 * 1024 ** 3, allocation: { mode: 'auto' } };
      await request(ctx.getHttpServer()).put('/users/me/household/quota').send(dto);
      expect(ctx.authenticate).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ permission: Permission.UserUpdate }),
      }));
      expect(service.updateOwnHouseholdQuota).toHaveBeenCalledWith(undefined, dto);
    });

    it('rejects malformed manual allocation before service call', async () => {
      const { status } = await request(ctx.getHttpServer()).put('/users/me/household/quota').send({
        quotaSizeInBytes: 4 * 1024 ** 3,
        allocation: { mode: 'manual', limits: { user: -1 } },
      });
      expect(status).toBe(400);
      expect(service.updateOwnHouseholdQuota).not.toHaveBeenCalled();
    });
  });

  describe('PUT /users/me', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).put('/users/me');
      expect(ctx.authenticate).toHaveBeenCalled();
    });

    for (const [key, message] of [
      ['email', 'Invalid input: expected email, received object'],
      ['name', 'Invalid input: expected string, received null'],
    ] as const) {
      it(`should not allow null ${key}`, async () => {
        const { status, body } = await request(ctx.getHttpServer())
          .put(`/users/me`)
          .set('Authorization', `Bearer token`)
          .send({ [key]: null });
        expect(status).toBe(400);
        expect(body).toEqual(errorDto.validationError([{ path: [key], message }]));
      });
    }

    it('should allow an empty avatarColor', async () => {
      await request(ctx.getHttpServer())
        .put(`/users/me`)
        .set('Authorization', `Bearer token`)
        .send({ avatarColor: null });
      expect(service.updateMe).toHaveBeenCalledWith(undefined, expect.objectContaining({ avatarColor: null }));
    });
  });

  describe('GET /users/:id', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).get(`/users/${factory.uuid()}`);
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });

  describe('PUT /users/me/license', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).put('/users/me/license');
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });

  describe('DELETE /users/me/license', () => {
    it('should be an authenticated route', async () => {
      await request(ctx.getHttpServer()).delete('/users/me/license');
      expect(ctx.authenticate).toHaveBeenCalled();
    });
  });
});
