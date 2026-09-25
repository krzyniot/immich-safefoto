import { randomUUID } from 'node:crypto';
import { Kysely } from 'kysely';
import { UserCreate, UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto direct household member creation - Stage 12', () => {
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

  const dto = (email = `stage12-${randomUUID()}@example.test`): UserCreate => ({
    email,
    name: 'Nowy Członek',
    password: 'already-hashed-for-repository-test',
    isAdmin: false,
    shouldChangePassword: true,
  });

  it('allows only the household admin to create a member directly', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    await expect(users.createHouseholdMember(member.id, dto())).rejects.toThrow('Household admin required');
  });

  it('creates the user directly in AUTO household and rebalances all member quotas', async () => {
    const { user: admin } = await ctx.newUser();
    const householdId = (await users.getHouseholdId(admin.id))!.householdId;
    await users.setHouseholdQuota(admin.id, 6 * GiB, { mode: 'auto' });
    const created = await users.createHouseholdMember(admin.id, dto());
    const createdMembership = await database.selectFrom('user').select(['householdId', 'isHouseholdAdmin'])
      .where('id', '=', created.id).executeTakeFirstOrThrow();
    expect(createdMembership.householdId).toBe(householdId);
    expect(createdMembership.isHouseholdAdmin).toBe(false);
    const members = await database.selectFrom('user').select(['id', 'quotaSizeInBytes'])
      .where('householdId', '=', householdId).where('deletedAt', 'is', null).orderBy('id').execute();
    expect(members).toHaveLength(2);
    expect(members.map((member) => Number(member.quotaSizeInBytes))).toEqual([3 * GiB, 3 * GiB]);
  });

  it('uses the minimum positive quota in MANUAL mode when free pool exists', async () => {
    const { user: admin } = await ctx.newUser();
    const householdId = (await users.getHouseholdId(admin.id))!.householdId;
    await users.setHouseholdQuota(admin.id, 4 * GiB, { mode: 'manual', limits: { [admin.id]: 2 * GiB } });
    const created = await users.createHouseholdMember(admin.id, dto());
    const household = await database.selectFrom('household').select('isQuotaAutoBalanced')
      .where('id', '=', householdId).executeTakeFirstOrThrow();
    const createdRow = await database.selectFrom('user').select('quotaSizeInBytes')
      .where('id', '=', created.id).executeTakeFirstOrThrow();
    expect(household.isQuotaAutoBalanced).toBe(false);
    expect(Number(createdRow.quotaSizeInBytes)).toBe(GiB);
  });

  it('asks for explicit AUTO fallback when MANUAL pool has no free quota', async () => {
    const { user: admin } = await ctx.newUser();
    const householdId = (await users.getHouseholdId(admin.id))!.householdId;
    await users.setHouseholdQuota(admin.id, 2 * GiB, { mode: 'manual', limits: { [admin.id]: 2 * GiB } });
    const email = `stage12-blocked-${randomUUID()}@example.test`;
    await expect(users.createHouseholdMember(admin.id, dto(email), false))
      .rejects.toThrow('auto balance required');
    await expect(database.selectFrom('user').select('id').where('email', '=', email).executeTakeFirst())
      .resolves.toBeUndefined();
    await expect(database.selectFrom('household').select('isQuotaAutoBalanced').where('id', '=', householdId)
      .executeTakeFirstOrThrow()).resolves.toMatchObject({ isQuotaAutoBalanced: false });
  });

  it('switches MANUAL to AUTO on explicit confirmation and rebalances the full pool', async () => {
    const { user: admin } = await ctx.newUser();
    const householdId = (await users.getHouseholdId(admin.id))!.householdId;
    await users.setHouseholdQuota(admin.id, 4 * GiB, { mode: 'manual', limits: { [admin.id]: 4 * GiB } });
    const created = await users.createHouseholdMember(admin.id, dto(), true);
    const household = await database.selectFrom('household').select('isQuotaAutoBalanced')
      .where('id', '=', householdId).executeTakeFirstOrThrow();
    const members = await database.selectFrom('user').select(['id', 'quotaSizeInBytes'])
      .where('householdId', '=', householdId).where('deletedAt', 'is', null).orderBy('id').execute();
    const createdMembership = await database.selectFrom('user').select('householdId')
      .where('id', '=', created.id).executeTakeFirstOrThrow();
    expect(createdMembership.householdId).toBe(householdId);
    expect(household.isQuotaAutoBalanced).toBe(true);
    expect(members.map((member) => Number(member.quotaSizeInBytes))).toEqual([2 * GiB, 2 * GiB]);
  });

  it('rolls back AUTO fallback and user creation when current usage cannot fit equal shares', async () => {
    const { user: admin } = await ctx.newUser();
    const householdId = (await users.getHouseholdId(admin.id))!.householdId;
    await users.setHouseholdQuota(admin.id, 4 * GiB, { mode: 'manual', limits: { [admin.id]: 4 * GiB } });
    await database.updateTable('user').set({ quotaUsageInBytes: 3 * GiB }).where('id', '=', admin.id).execute();
    const email = `stage12-usage-${randomUUID()}@example.test`;
    await expect(users.createHouseholdMember(admin.id, dto(email), true))
      .rejects.toThrow('cannot accommodate another member');
    await expect(database.selectFrom('user').select('id').where('email', '=', email).executeTakeFirst())
      .resolves.toBeUndefined();
    await expect(database.selectFrom('household').select('isQuotaAutoBalanced').where('id', '=', householdId)
      .executeTakeFirstOrThrow()).resolves.toMatchObject({ isQuotaAutoBalanced: false });
  });
  it('lets the household admin set a family name visible in the household summary', async () => {
    const { user: admin } = await ctx.newUser();
    await users.updateOwnHouseholdName(admin.id, 'Rodzina Testowa');
    const summary = await users.getOwnHouseholdSummary(admin.id);
    expect(summary.name).toBe('Rodzina Testowa');
  });

  it('does not let a regular member rename the family', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    await expect(users.updateOwnHouseholdName(member.id, 'Nie moja nazwa')).rejects.toThrow('Household admin required');
    const summary = await users.getOwnHouseholdSummary(admin.id);
    expect(summary.name).toBeNull();
  });

});
