import { Kysely } from 'kysely';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PartnerRepository } from 'src/repositories/partner.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let defaultDatabase: Kysely<DB>;

const setup = (db?: Kysely<DB>) => {
  const { ctx } = newMediumService(BaseService, {
    database: db || defaultDatabase,
    real: [],
    mock: [LoggingRepository],
  });
  return { ctx, sut: ctx.get(PartnerRepository) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe(PartnerRepository.name, () => {
  it('does not remove a stale partner across different households', async () => {
    const { ctx, sut } = setup();
    const { result: user1 } = await ctx.newUser();
    const { result: user2 } = await ctx.newUser();
    const { householdId: household1 } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', user1.id)
      .executeTakeFirstOrThrow();

    await ctx.database.updateTable('user').set({ householdId: household1, isHouseholdAdmin: false }).where('id', '=', user2.id).execute();
    await ctx.newPartner({ sharedById: user1.id, sharedWithId: user2.id });

    const { result: user3 } = await ctx.newUser();
    const { householdId: household3 } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', user3.id)
      .executeTakeFirstOrThrow();
    await ctx.database.updateTable('user').set({ householdId: household3, isHouseholdAdmin: false }).where('id', '=', user2.id).execute();

    await sut.remove({ sharedById: user1.id, sharedWithId: user2.id });

    const relation = await ctx.database
      .selectFrom('partner')
      .selectAll()
      .where('sharedById', '=', user1.id)
      .where('sharedWithId', '=', user2.id)
      .executeTakeFirst();
    expect(relation).toBeDefined();
  });

  it('rejects updating a stale partner across different households', async () => {
    const { ctx, sut } = setup();
    const { result: user1 } = await ctx.newUser();
    const { result: user2 } = await ctx.newUser();
    const { householdId: household1 } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', user1.id)
      .executeTakeFirstOrThrow();

    await ctx.database.updateTable('user').set({ householdId: household1, isHouseholdAdmin: false }).where('id', '=', user2.id).execute();
    await ctx.newPartner({ sharedById: user1.id, sharedWithId: user2.id });

    const { result: user3 } = await ctx.newUser();
    const { householdId: household3 } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', user3.id)
      .executeTakeFirstOrThrow();
    await ctx.database.updateTable('user').set({ householdId: household3, isHouseholdAdmin: false }).where('id', '=', user2.id).execute();

    await expect(sut.update({ sharedById: user1.id, sharedWithId: user2.id }, { inTimeline: true })).rejects.toThrow();
  });

  it('rejects creating a partner across different households', async () => {
    const { ctx, sut } = setup();
    const { result: user1 } = await ctx.newUser();
    const { result: user2 } = await ctx.newUser();

    await expect(sut.create({ sharedById: user1.id, sharedWithId: user2.id })).rejects.toThrow();
  });

  it('preserves inTimeline when creating a same-household partner', async () => {
    const { ctx, sut } = setup();
    const { result: user1 } = await ctx.newUser();
    const { result: user2 } = await ctx.newUser();
    const { householdId } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', user1.id)
      .executeTakeFirstOrThrow();
    await ctx.database.updateTable('user').set({ householdId, isHouseholdAdmin: false }).where('id', '=', user2.id).execute();

    await expect(sut.create({ sharedById: user1.id, sharedWithId: user2.id, inTimeline: true })).resolves.toEqual(
      expect.objectContaining({ inTimeline: true }),
    );
  });
  it('returns partners from the same household', async () => {
    const { ctx, sut } = setup();
    const { result: user1 } = await ctx.newUser();
    const { result: user2 } = await ctx.newUser();
    const { householdId: household1 } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', user1.id)
      .executeTakeFirstOrThrow();

    await ctx.database.updateTable('user').set({ householdId: household1, isHouseholdAdmin: false }).where('id', '=', user2.id).execute();

    await ctx.newPartner({ sharedById: user1.id, sharedWithId: user2.id });

    await expect(sut.getAll(user1.id)).resolves.toHaveLength(1);
    await expect(sut.get({ sharedById: user1.id, sharedWithId: user2.id })).resolves.toBeDefined();
  });

  it('hides stale partners after users split into different households', async () => {
    const { ctx, sut } = setup();
    const { result: user1 } = await ctx.newUser();
    const { result: user2 } = await ctx.newUser();

    const { householdId: household1 } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', user1.id)
      .executeTakeFirstOrThrow();
    await ctx.database.updateTable('user').set({ householdId: household1, isHouseholdAdmin: false }).where('id', '=', user2.id).execute();
    await ctx.newPartner({ sharedById: user1.id, sharedWithId: user2.id });

    const { result: user3 } = await ctx.newUser();
    const { householdId: household3 } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', user3.id)
      .executeTakeFirstOrThrow();

    await ctx.database.updateTable('user').set({ householdId: household3, isHouseholdAdmin: false }).where('id', '=', user2.id).execute();

    await expect(sut.getAll(user1.id)).resolves.toEqual([]);
    await expect(sut.get({ sharedById: user1.id, sharedWithId: user2.id })).resolves.toBeUndefined();
  });
});
