import { Kysely } from 'kysely';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto authenticated household contract - Stage 3E1', () => {
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

  it('summarizes only the current user household and distinguishes its admin from a member', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    await users.setHouseholdQuota(admin.id, 4 * GiB, { mode: 'auto' });
    const householdId = (await users.getHouseholdId(admin.id))!.householdId;
    expect(await users.getOwnHouseholdSummary(admin.id)).toEqual({ householdId, name: null,
      isHouseholdAdmin: true, quotaSizeInBytes: 4 * GiB, isQuotaAutoBalanced: true, memberCount: 2 });
    expect(await users.getOwnHouseholdSummary(member.id)).toEqual({ householdId, name: null,
      isHouseholdAdmin: false, quotaSizeInBytes: 4 * GiB, isQuotaAutoBalanced: true, memberCount: 2 });
    expect(Object.keys(await users.getOwnHouseholdSummary(member.id)).sort()).toEqual([
      'householdId', 'isHouseholdAdmin', 'isQuotaAutoBalanced', 'memberCount', 'name', 'quotaSizeInBytes',
    ]);
  });

  it('uses Stage 3C AUTO rebalance and rolls back an impossible downgrade', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    const id = (await users.getHouseholdId(admin.id))!.householdId;
    await users.setHouseholdQuota(admin.id, 4 * GiB, { mode: 'auto' });
    await users.setHouseholdStoragePool(id, 8 * GiB);
    expect((await users.getOwnHouseholdSummary(admin.id)).quotaSizeInBytes).toBe(8 * GiB);
    const quotas = await database.selectFrom('user').select('quotaSizeInBytes').where('householdId', '=', id).execute();
    expect(quotas.map(({ quotaSizeInBytes }) => Number(quotaSizeInBytes))).toEqual([4 * GiB, 4 * GiB]);
    await database.updateTable('user').set({ quotaUsageInBytes: 3 * GiB }).where('id', '=', member.id).execute();
    await expect(users.setHouseholdStoragePool(id, 4 * GiB)).rejects.toThrow('cannot be divided');
    expect((await users.getOwnHouseholdSummary(admin.id)).quotaSizeInBytes).toBe(8 * GiB);
    expect((await users.getHouseholdId(admin.id))!.householdId).toBe(id);
  });

  it('preserves MANUAL allocations and reports a missing household', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    const id = (await users.getHouseholdId(admin.id))!.householdId;
    await users.setHouseholdQuota(admin.id, 6 * GiB,
      { mode: 'manual', limits: { [admin.id]: 3 * GiB, [member.id]: 2 * GiB } });
    await expect(users.setHouseholdStoragePool(id, 4 * GiB)).rejects.toThrow('Member quotas exceed');
    expect((await users.getOwnHouseholdSummary(admin.id)).quotaSizeInBytes).toBe(6 * GiB);
    await users.setHouseholdStoragePool(id, 5 * GiB);
    const quotas = await database.selectFrom('user').select('quotaSizeInBytes').where('householdId', '=', id).execute();
    expect(quotas.map(({ quotaSizeInBytes }) => Number(quotaSizeInBytes)).sort()).toEqual([2 * GiB, 3 * GiB]);
    await expect(users.setHouseholdStoragePool('00000000-0000-4000-8000-000000000000', 5 * GiB))
      .rejects.toThrow('Household not found');
  });
});
