import { Kysely, sql } from 'kysely';
import { AlbumUserRole } from 'src/enum';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import {
  up as addHouseholdSchema,
  down as removeHouseholdSchema,
} from 'src/schema/migrations/1789142247620-AddSafeFotoHousehold';
import {
  down as removeHouseholdAudit,
  up as addHouseholdAudit,
} from 'src/schema/migrations/1789146351047-AddHouseholdToUserAudit';
import {
  down as removeHouseholdAdminAndQuota,
  up as addHouseholdAdminAndQuota,
} from 'src/schema/migrations/1789150000000-AddSafeFotoHouseholdAdminAndQuota';
import {
  down as removeHouseholdInvitations,
  up as addHouseholdInvitations,
} from 'src/schema/migrations/1789160000000-AddSafeFotoHouseholdInvitations';
import { mediumFactory } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

const user1Id = '00000000-0000-4000-8000-000000000001';
const user2Id = '00000000-0000-4000-8000-000000000002';

let database: Kysely<DB>;

beforeAll(async () => {
  database = await getKyselyDB();

  // Recreate the exact pre-Stage-1A shape, add synthetic existing users and
  // sharing relationships, then exercise this migration directly.
  await removeHouseholdInvitations(database);
  await removeHouseholdAdminAndQuota(database);
  await removeHouseholdAudit(database);
  await removeHouseholdSchema(database);
  await sql`INSERT INTO "user" ("id", "email", "name") VALUES
    (${user1Id}::uuid, 'stage1a-a@example.invalid', 'Stage 1A A'),
    (${user2Id}::uuid, 'stage1a-b@example.invalid', 'Stage 1A B');`.execute(database);

  const album = await database.insertInto('album').values(mediumFactory.albumInsert({})).returning('id').executeTakeFirstOrThrow();
  await database
    .insertInto('album_user')
    .values([
      { albumId: album.id, userId: user1Id, role: AlbumUserRole.Owner },
      { albumId: album.id, userId: user2Id, role: AlbumUserRole.Viewer },
    ])
    .execute();
  await database.insertInto('partner').values({ sharedById: user1Id, sharedWithId: user2Id }).execute();

  await addHouseholdSchema(database);
  await addHouseholdAudit(database);
  await addHouseholdAdminAndQuota(database);
  await addHouseholdInvitations(database);
});

afterAll(async () => {
  await database.destroy();
});

describe.sequential('SafeFoto household schema and migration', () => {
  it('creates a household on a freshly migrated database', async () => {
    const household = await database.insertInto('household').defaultValues().returningAll().executeTakeFirstOrThrow();

    expect(household.id).toEqual(expect.any(String));
    expect(household.createdAt).toBeInstanceOf(Date);
    expect(household.updatedAt).toBeInstanceOf(Date);
  });

  it('creates a one-person household transactionally for a new user', async () => {
    const repository = new UserRepository(database);
    const created = await repository.create(mediumFactory.userInsert({ email: 'stage1a-new@example.invalid' }));
    const user = await database
      .selectFrom('user')
      .select(['id', 'householdId'])
      .where('id', '=', created.id)
      .executeTakeFirstOrThrow();

    expect(user.householdId).toEqual(expect.any(String));
    await expect(
      database.selectFrom('household').select('id').where('id', '=', user.householdId).executeTakeFirstOrThrow(),
    ).resolves.toEqual({ id: user.householdId });
  });

  it('backfills two existing users into two different households', async () => {
    const users = await database
      .selectFrom('user')
      .select(['id', 'householdId'])
      .where('id', 'in', [user1Id, user2Id])
      .orderBy('id')
      .execute();

    expect(users).toHaveLength(2);
    expect(users[0].householdId).not.toBeNull();
    expect(users[1].householdId).not.toBeNull();
    expect(users[0].householdId).not.toBe(users[1].householdId);
  });

  it('makes householdId NOT NULL', async () => {
    await expect(
      sql`UPDATE "user" SET "householdId" = NULL WHERE "id" = ${user1Id}::uuid;`.execute(database),
    ).rejects.toThrow();
  });

  it('enforces the household foreign key', async () => {
    await expect(
      sql`UPDATE "user" SET "householdId" = 'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid WHERE "id" = ${user1Id}::uuid;`.execute(
        database,
      ),
    ).rejects.toThrow();
  });

  it('does not infer a household from album_user', async () => {
    const users = await database
      .selectFrom('user')
      .innerJoin('album_user', 'album_user.userId', 'user.id')
      .select(['user.id', 'user.householdId'])
      .where('user.id', 'in', [user1Id, user2Id])
      .orderBy('user.id')
      .execute();

    expect(users).toHaveLength(2);
    expect(users[0].householdId).not.toBe(users[1].householdId);
  });

  it('does not infer a household from partner', async () => {
    const users = await database
      .selectFrom('user')
      .innerJoin('partner', (join) =>
        join.on((eb) =>
          eb.or([eb('partner.sharedById', '=', eb.ref('user.id')), eb('partner.sharedWithId', '=', eb.ref('user.id'))]),
        ),
      )
      .select(['user.id', 'user.householdId'])
      .where('user.id', 'in', [user1Id, user2Id])
      .orderBy('user.id')
      .execute();

    expect(users).toHaveLength(2);
    expect(users[0].householdId).not.toBe(users[1].householdId);
  });
});
