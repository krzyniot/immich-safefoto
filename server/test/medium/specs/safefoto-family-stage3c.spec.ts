import { Kysely } from 'kysely';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto household storage pool - Stage 3C', () => {
  let database: Kysely<DB>;
  let ctx: SyncTestContext;
  let users: UserRepository;
  const GiB = 1024 ** 3;

  beforeAll(async () => {
    database = await getKyselyDB();
    ctx = new SyncTestContext(database);
    users = ctx.get(UserRepository);
  });

  afterAll(async () => {
    await database.destroy();
  });

  const snapshot = async (householdId: string) => ({
    household: await database.selectFrom('household').select(['id', 'quotaSizeInBytes', 'isQuotaAutoBalanced'])
      .where('id', '=', householdId).executeTakeFirstOrThrow(),
    members: await database.selectFrom('user').select(['id', 'quotaSizeInBytes'])
      .where('householdId', '=', householdId).where('deletedAt', 'is', null).orderBy('id').execute(),
  });

  it('upgrades AUTO without changing household identity and rebalances the pool', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    const id = (await users.getHouseholdId(admin.id))!.householdId;
    await users.setHouseholdQuota(admin.id, 4 * GiB, { mode: 'auto' });
    await users.setHouseholdStoragePool(id, 8 * GiB);
    const after = await snapshot(id);
    expect(after.household.id).toBe(id);
    expect(Number(after.household.quotaSizeInBytes)).toBe(8 * GiB);
    expect(after.members.map((member) => Number(member.quotaSizeInBytes))).toEqual([4 * GiB, 4 * GiB]);
    await expect(users.getHouseholdId(member.id)).resolves.toEqual({ householdId: id });
  });

  it('upgrades MANUAL while preserving assignments and leaving the difference unallocated', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    const id = (await users.getHouseholdId(admin.id))!.householdId;
    await users.setHouseholdQuota(admin.id, 4 * GiB,
      { mode: 'manual', limits: { [admin.id]: 2 * GiB, [member.id]: GiB } });
    const before = await snapshot(id);
    await users.setHouseholdStoragePool(id, 6 * GiB);
    const after = await snapshot(id);
    expect(after.household.id).toBe(id);
    expect(after.household.isQuotaAutoBalanced).toBe(false);
    expect(Number(after.household.quotaSizeInBytes)).toBe(6 * GiB);
    expect(after.members).toEqual(before.members);
  });

  it('rejects AUTO downgrade below member usage without changing any allocation', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    const id = (await users.getHouseholdId(admin.id))!.householdId;
    await users.setHouseholdQuota(admin.id, 8 * GiB, { mode: 'auto' });
    await database.updateTable('user').set({ quotaUsageInBytes: 3 * GiB }).where('id', '=', member.id).execute();
    expect(await users.getHouseholdUsage(id)).toBe(3 * GiB);
    const before = await snapshot(id);
    await expect(users.setHouseholdStoragePool(id, 4 * GiB)).rejects.toThrow('cannot be divided');
    expect(await snapshot(id)).toEqual(before);
  });

  it('rejects MANUAL downgrade below assigned limits without partial changes', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    const id = (await users.getHouseholdId(admin.id))!.householdId;
    await users.setHouseholdQuota(admin.id, 6 * GiB,
      { mode: 'manual', limits: { [admin.id]: 3 * GiB, [member.id]: 2 * GiB } });
    const before = await snapshot(id);
    await expect(users.setHouseholdStoragePool(id, 4 * GiB)).rejects.toThrow('Member quotas exceed');
    expect(await snapshot(id)).toEqual(before);
    await users.setHouseholdStoragePool(id, 5 * GiB);
    expect((await snapshot(id)).members).toEqual(before.members);
  });

  it('sums current usage of active members and rejects member changes through the user route', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    const id = (await users.getHouseholdId(admin.id))!.householdId;
    await database.updateTable('user').set({ quotaUsageInBytes: GiB }).where('id', '=', admin.id).execute();
    await database.updateTable('user').set({ quotaUsageInBytes: 2 * GiB }).where('id', '=', member.id).execute();
    expect(await users.getHouseholdUsage(id)).toBe(3 * GiB);
    await expect(users.setHouseholdQuota(member.id, 6 * GiB, { mode: 'auto' }))
      .rejects.toThrow('Household admin required');
  });

  it('keeps the household ID on admin transfer and membership changes', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: successor } = await ctx.newUser();
    const { user: newcomer } = await ctx.newUser();
    const targetId = (await users.getHouseholdId(admin.id))!.householdId;
    const oldId = (await users.getHouseholdId(newcomer.id))!.householdId;
    await users.setHouseholdQuota(admin.id, 6 * GiB, { mode: 'auto' });
    await users.moveToHouseholdOf(successor.id, admin.id);
    await users.transferHouseholdAdmin(admin.id, successor.id);
    await expect(users.getHouseholdId(successor.id)).resolves.toEqual({ householdId: targetId });
    const invitation = await users.createHouseholdInvitation(successor.id, newcomer.id);
    await users.acceptHouseholdInvitation(newcomer.id, invitation.id);
    await expect(users.getHouseholdId(newcomer.id)).resolves.toEqual({ householdId: targetId });
    const after = await snapshot(targetId);
    expect(after.household.id).toBe(targetId);
    expect(after.members).toHaveLength(3);
    expect(after.members.map((member) => Number(member.quotaSizeInBytes))).toEqual([2 * GiB, 2 * GiB, 2 * GiB]);
    await expect(database.selectFrom('household').select('id').where('id', '=', oldId)
      .executeTakeFirst()).resolves.toBeUndefined();
  });
});
