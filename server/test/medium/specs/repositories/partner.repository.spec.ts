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
  it('returns partners from the same household', async () => {
    const { ctx, sut } = setup();
    const { result: user1 } = await ctx.newUser();
    const { result: user2 } = await ctx.newUser();
    const { householdId: household1 } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', user1.id)
      .executeTakeFirstOrThrow();

    await ctx.database
      .updateTable('user')
      .set({ householdId: household1 })
      .where('id', '=', user2.id)
      .execute();

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
    await ctx.database
      .updateTable('user')
      .set({ householdId: household1 })
      .where('id', '=', user2.id)
      .execute();
    await ctx.newPartner({ sharedById: user1.id, sharedWithId: user2.id });

    const { result: user3 } = await ctx.newUser();
    const { householdId: household3 } = await ctx.database
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', user3.id)
      .executeTakeFirstOrThrow();

    await ctx.database
      .updateTable('user')
      .set({ householdId: household3 })
      .where('id', '=', user2.id)
      .execute();

    await expect(sut.getAll(user1.id)).resolves.toEqual([]);
    await expect(sut.get({ sharedById: user1.id, sharedWithId: user2.id })).resolves.toBeUndefined();
  });
});