import { Kysely } from 'kysely';
import { SyncEntityType, SyncRequestType } from 'src/enum';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto household runtime sync - Stage 2E', () => {
  let database: Kysely<DB>;
  let ctx: SyncTestContext;
  let users: UserRepository;

  beforeAll(async () => {
    database = await getKyselyDB();
    ctx = new SyncTestContext(database);
    users = ctx.get(UserRepository);
  });

  afterAll(async () => {
    await database.destroy();
  });

  it('forces both sides of stale sharing to reset and does not resurrect the old partner', async () => {
    const moving = await ctx.newSyncAuthUser();
    const oldMember = await ctx.newSyncAuthUser();
    const targetMember = await ctx.newSyncAuthUser();

    await ctx.moveUserToHouseholdOf(oldMember.user.id, moving.user.id);
    await ctx.newPartner({ sharedById: moving.user.id, sharedWithId: oldMember.user.id });

    const movingInitial = await ctx.syncStream(moving.auth, [SyncRequestType.PartnersV1]);
    expect(movingInitial).toEqual([
      expect.objectContaining({ type: SyncEntityType.PartnerV1 }),
      expect.objectContaining({ type: SyncEntityType.SyncCompleteV1 }),
    ]);
    await ctx.syncAckAll(moving.auth, movingInitial);

    const oldMemberInitial = await ctx.syncStream(oldMember.auth, [SyncRequestType.PartnersV1]);
    expect(oldMemberInitial).toEqual([
      expect.objectContaining({ type: SyncEntityType.PartnerV1 }),
      expect.objectContaining({ type: SyncEntityType.SyncCompleteV1 }),
    ]);
    await ctx.syncAckAll(oldMember.auth, oldMemberInitial);

    await users.moveToHouseholdOf(moving.user.id, targetMember.user.id);

    const movingReset = await ctx.syncStream(moving.auth, [SyncRequestType.PartnersV1]);
    expect(movingReset).toEqual([{ type: SyncEntityType.SyncResetV1, data: {}, ack: 'SyncResetV1|reset' }]);

    const oldMemberReset = await ctx.syncStream(oldMember.auth, [SyncRequestType.PartnersV1]);
    expect(oldMemberReset).toEqual([{ type: SyncEntityType.SyncResetV1, data: {}, ack: 'SyncResetV1|reset' }]);

    await ctx.assertSyncIsComplete(targetMember.auth, [SyncRequestType.PartnersV1]);

    await ctx.syncAckAll(moving.auth, movingReset);
    await ctx.syncAckAll(oldMember.auth, oldMemberReset);

    await ctx.assertSyncIsComplete(moving.auth, [SyncRequestType.PartnersV1]);
    await ctx.assertSyncIsComplete(oldMember.auth, [SyncRequestType.PartnersV1]);
  });
});
