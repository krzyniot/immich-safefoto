import { Kysely } from 'kysely';
import { DB } from 'src/schema';
import { UserRepository } from 'src/repositories/user.repository';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto household management - Stage 3A', () => {
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

  it('creates a new household with its creator as admin and automatic quota allocation enabled', async () => {
    const { user } = await ctx.newUser();

    const createdUser = await database
      .selectFrom('user')
      .select(['householdId', 'isHouseholdAdmin'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();

    expect(createdUser.isHouseholdAdmin).toBe(true);

    await expect(
      database
        .selectFrom('household')
        .select(['quotaSizeInBytes', 'isQuotaAutoBalanced'])
        .where('id', '=', createdUser.householdId)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({
      quotaSizeInBytes: null,
      isQuotaAutoBalanced: true,
    });
  });

  it('allows at most one household admin', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();

    const { householdId } = await database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', admin.id)
      .executeTakeFirstOrThrow();

    await database
      .updateTable('user')
      .set({ householdId, isHouseholdAdmin: false })
      .where('id', '=', member.id)
      .execute();

    await expect(
      database.updateTable('user').set({ isHouseholdAdmin: true }).where('id', '=', member.id).execute(),
    ).rejects.toThrow();

    await expect(
      database
        .selectFrom('user')
        .select(['id', 'isHouseholdAdmin'])
        .where('householdId', '=', householdId)
        .orderBy('id')
        .execute(),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: admin.id, isHouseholdAdmin: true }),
        expect.objectContaining({ id: member.id, isHouseholdAdmin: false }),
      ]),
    );
  });

  it('divides the family pool equally when a member joins and preserves one admin', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.setHouseholdQuota(admin.id, 7 * GiB, { mode: 'auto' });
    await users.moveToHouseholdOf(member.id, admin.id);

    const household = await users.getHouseholdId(admin.id);
    const members = await database.selectFrom('user')
      .select(['id', 'isHouseholdAdmin', 'quotaSizeInBytes'])
      .where('householdId', '=', household!.householdId).execute();
    expect(members).toHaveLength(2);
    expect(members.map((member) => Number(member.quotaSizeInBytes)).sort()).toEqual([3.5 * GiB, 3.5 * GiB]);
    expect(members.filter((member) => member.isHouseholdAdmin).map((member) => member.id).toEqual([admin.id]);
  });

  it('rejects a seventh member without changing membership', async () => {
    const { user: admin } = await ctx.newUser();
    for (let index = 0; index < 5; index++) {
      const { user } = await ctx.newUser();
      await users.moveToHouseholdOf(user.id, admin.id);
    }
    const { user: seventh } = await ctx.newUser();
    const before = await users.getHouseholdId(seventh.id);
    await expect(users.moveToHouseholdOf(seventh.id, admin.id)).rejects.toThrow('Household is full');
    await expect(users.getHouseholdId(seventh.id)).resolves.toEqual(before);
  });

  it('requires free quota for a new member in manual mode', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.setHouseholdQuota(admin.id, 2 * GiB, { mode: 'manual', limits: { [admin.id]: 2 * GiB } });
    await expect(users.moveToHouseholdOf(member.id, admin.id)).rejects.toThrow('Free household quota');
    await users.setHouseholdQuota(admin.id, 2 * GiB, { mode: 'manual', limits: { [admin.id]: GiB } });
    await users.moveToHouseholdOf(member.id, admin.id);
    const moved = await database
      .selectFrom('user')
      .select('quotaSizeInBytes')
      .where('id', '=', member.id)
      .executeTakeFirstOrThrow();
    expect(Number(moved.quotaSizeInBytes)).toBe(GiB);
  });

  it('validates manual allocations and keeps the family administrator after a move', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    await expect(users.setHouseholdQuota(member.id, 3 * GiB, { mode: 'auto' })).rejects.toThrow(
      'Household admin required',
    );
    await expect(users.setHouseholdQuota(admin.id, 3 * GiB, {
      mode: 'manual', limits: { [admin.id]: 2 * GiB, [member.id]: 2 * GiB },
    })).rejects.toThrow('Member quotas exceed');
    const { user: otherAdmin } = await ctx.newUser();
    await users.moveToHouseholdOf(admin.id, otherAdmin.id);
    const previousFamily = await users.getHouseholdId(member.id);
    const remaining = await database.selectFrom('user').select('isHouseholdAdmin')
      .where('id', '=', member.id).executeTakeFirstOrThrow();
    expect(previousFamily).toBeDefined();
    expect(remaining.isHouseholdAdmin).toBe(true);
  });

  it('transfers administration only to a member of the same household', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    await expect(users.transferHouseholdAdmin(admin.id, outsider.id)).rejects.toThrow('Successor must belong');
    await users.transferHouseholdAdmin(admin.id, member.id);
    await expect(users.setHouseholdQuota(admin.id, 2 * GiB, { mode: 'auto' })).rejects.toThrow(
      'Household admin required',
    );
    await expect(users.setHouseholdQuota(member.id, 2 * GiB, { mode: 'auto' })).resolves.toBeUndefined();
  });
});
