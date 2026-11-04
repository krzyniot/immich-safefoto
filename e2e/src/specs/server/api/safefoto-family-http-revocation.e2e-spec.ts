import type { LoginResponseDto } from '@immich/sdk';
import { assertSafeFotoE2EDatabase } from 'src/safefoto-e2e-safety';
import { createUserDto } from 'src/fixtures';
import { app, utils } from 'src/utils';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * HTTP regression for the dedicated Immich E2E stack (port 2285).
 * DO NOT point it at kris-Standard's running 13013 lab or any production database.
 * This spec intentionally performs a destructive E2E-only reset in beforeAll.
 */
describe('SafeFoto family HTTP media access revocation', () => {
  let admin: LoginResponseDto;
  let owner: LoginResponseDto;
  let member: LoginResponseDto;
  let anotherFamily: LoginResponseDto;
  let assetId: string;

  beforeAll(async () => {
    assertSafeFotoE2EDatabase();

    await utils.resetDatabase();
    admin = await utils.adminSetup({ onboarding: false });
    [owner, member, anotherFamily] = await Promise.all([
      utils.userSetup(admin.accessToken, createUserDto.create('safefoto-owner')),
      utils.userSetup(admin.accessToken, createUserDto.create('safefoto-member')),
      utils.userSetup(admin.accessToken, createUserDto.create('safefoto-other-family')),
    ]);

    // Dedicated E2E database only. This changes membership test fixtures directly,
    // exercising HTTP authorization without touching real households.
    const db = await utils.connectDatabase();
    await db.query(
      'UPDATE "user" SET "householdId" = (SELECT "householdId" FROM "user" WHERE id = $1) WHERE id = $2',
      [owner.userId, member.userId],
    );

    const asset = await utils.createAsset(owner.accessToken);
    assetId = asset.id;
    const publication = await request(app)
      .put('/family/photos/publication')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ assetIds: [assetId], mode: 'share' });
    expect(publication.status).toBe(204);
    await utils.waitForQueueFinish(admin.accessToken, 'thumbnailGeneration');
  }, 60_000);

  const media = async (token: string, suffix: 'thumbnail' | 'original') =>
    request(app).get(`/assets/${assetId}/${suffix}`).set('Authorization', `Bearer ${token}`);

  it('serves published thumbnails and originals to family, but not another family', async () => {
    for (const kind of ['thumbnail', 'original'] as const) {
      const allowed = await media(member.accessToken, kind);
      expect(allowed.status).toBe(200);
      const denied = await media(anotherFamily.accessToken, kind);
      expect(denied.status).not.toBe(200);
    }
    const list = await request(app).get('/family/photos').set('Authorization', `Bearer ${member.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([expect.objectContaining({ id: assetId })]);
  });

  it('immediately denies all photo HTTP endpoints after the member changes households', async () => {
    const db = await utils.connectDatabase();
    await db.query(
      'UPDATE "user" SET "householdId" = (SELECT "householdId" FROM "user" WHERE id = $1) WHERE id = $2',
      [anotherFamily.userId, member.userId],
    );

    const list = await request(app).get('/family/photos').set('Authorization', `Bearer ${member.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([]);

    for (const kind of ['thumbnail', 'original'] as const) {
      const denied = await media(member.accessToken, kind);
      expect(denied.status).not.toBe(200);
      const ownerStillAllowed = await media(owner.accessToken, kind);
      expect(ownerStillAllowed.status).toBe(200);
    }
  });
});
