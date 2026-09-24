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
    expect(members.filter((member) => member.isHouseholdAdmin).map((member) => member.id)).toEqual([admin.id]);
  });

  it('returns the current admin of the caller household only', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);

    await expect(users.getOwnHouseholdAdmin(member.id)).resolves.toMatchObject({
      id: admin.id, name: admin.name, email: admin.email,
    });
    await expect(users.getOwnHouseholdAdmin(outsider.id)).resolves.toMatchObject({
      id: outsider.id, name: outsider.name, email: outsider.email,
    });
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

  it('validates manual allocations and requires an explicit successor before the admin moves', async () => {
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
    const previousFamily = await users.getHouseholdId(admin.id);
    await expect(users.moveToHouseholdOf(admin.id, otherAdmin.id)).rejects.toThrow(
      'Household admin must transfer administration before leaving',
    );
    await expect(users.getHouseholdId(admin.id)).resolves.toEqual(previousFamily);
    await expect(database.selectFrom('user').select('isHouseholdAdmin').where('id', '=', member.id)
      .executeTakeFirstOrThrow()).resolves.toMatchObject({ isHouseholdAdmin: false });
    await expect(users.moveToNewHousehold(admin.id)).rejects.toThrow(
      'Household admin must transfer administration before leaving',
    );
    await expect(users.getHouseholdId(admin.id)).resolves.toEqual(previousFamily);

    await users.transferHouseholdAdmin(admin.id, member.id);
    await users.moveToHouseholdOf(admin.id, otherAdmin.id);
    await expect(users.getHouseholdId(admin.id)).resolves.toEqual(await users.getHouseholdId(otherAdmin.id));
    await expect(users.getHouseholdId(member.id)).resolves.toEqual(previousFamily);
    const remaining = await database.selectFrom('user').select(['id', 'isHouseholdAdmin'])
      .where('householdId', '=', previousFamily!.householdId).execute();
    expect(remaining).toEqual([{ id: member.id, isHouseholdAdmin: true }]);
    await expect(database.selectFrom('user').select('isHouseholdAdmin').where('id', '=', admin.id)
      .executeTakeFirstOrThrow()).resolves.toMatchObject({ isHouseholdAdmin: false });
  });

  it('moves the sole admin to another household and removes the empty household', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: otherAdmin } = await ctx.newUser();
    const oldHousehold = await users.getHouseholdId(admin.id);

    await users.moveToHouseholdOf(admin.id, otherAdmin.id);

    await expect(users.getHouseholdId(admin.id)).resolves.toEqual(await users.getHouseholdId(otherAdmin.id));
    await expect(database.selectFrom('household').select('id').where('id', '=', oldHousehold!.householdId)
      .executeTakeFirst()).resolves.toBeUndefined();
    const members = await database.selectFrom('user').select(['id', 'isHouseholdAdmin'])
      .where('householdId', '=', (await users.getHouseholdId(otherAdmin.id))!.householdId).execute();
    expect(members).toEqual(expect.arrayContaining([
      { id: admin.id, isHouseholdAdmin: false },
      { id: otherAdmin.id, isHouseholdAdmin: true },
    ]));
  });

  it('allows household admin to remove only a regular member into a new one-person household', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    const source = await users.getHouseholdId(admin.id);

    await expect(users.removeHouseholdMember(member.id, admin.id)).rejects.toThrow('Household admin required');
    await expect(users.removeHouseholdMember(admin.id, outsider.id)).rejects.toThrow('Member must belong');
    await expect(users.removeHouseholdMember(admin.id, admin.id)).rejects.toThrow('cannot remove self');

    await users.removeHouseholdMember(admin.id, member.id);
    const adminAfter = await users.getHouseholdId(admin.id);
    const memberAfter = await users.getHouseholdId(member.id);
    expect(adminAfter?.householdId).toBe(source?.householdId);
    expect(memberAfter?.householdId).not.toBe(source?.householdId);
    await expect(database.selectFrom('user').select('isHouseholdAdmin').where('id', '=', member.id)
      .executeTakeFirstOrThrow()).resolves.toMatchObject({ isHouseholdAdmin: true });
    await expect(database.selectFrom('user').select('isHouseholdAdmin').where('id', '=', admin.id)
      .executeTakeFirstOrThrow()).resolves.toMatchObject({ isHouseholdAdmin: true });
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
