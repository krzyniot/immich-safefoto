import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "household" ADD "quotaSizeInBytes" bigint;`.execute(db);
  await sql`ALTER TABLE "household" ADD "isQuotaAutoBalanced" boolean NOT NULL DEFAULT true;`.execute(db);
  await sql`ALTER TABLE "user" ADD "isHouseholdAdmin" boolean NOT NULL DEFAULT false;`.execute(db);

  await sql`
    WITH ranked AS (
      SELECT
        "id",
        row_number() OVER (
          PARTITION BY "householdId"
          ORDER BY "createdAt" ASC, "id" ASC
        ) AS "position"
      FROM "user"
    )
    UPDATE "user" AS "target"
    SET "isHouseholdAdmin" = true
    FROM ranked
    WHERE "target"."id" = ranked."id"
      AND ranked."position" = 1;
  `.execute(db);

  await sql`
    UPDATE "household" AS "target"
    SET "quotaSizeInBytes" = "quota"."total"
    FROM (
      SELECT
        "householdId",
        CASE
          WHEN count(*) FILTER (WHERE "quotaSizeInBytes" IS NOT NULL) = 0 THEN NULL
          ELSE sum(coalesce("quotaSizeInBytes", 0))
        END AS "total"
      FROM "user"
      GROUP BY "householdId"
    ) AS "quota"
    WHERE "target"."id" = "quota"."householdId";
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX "user_household_admin_idx"
    ON "user" ("householdId")
    WHERE "isHouseholdAdmin" = true;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX "user_household_admin_idx";`.execute(db);
  await sql`ALTER TABLE "user" DROP COLUMN "isHouseholdAdmin";`.execute(db);
  await sql`ALTER TABLE "household" DROP COLUMN "isQuotaAutoBalanced";`.execute(db);
  await sql`ALTER TABLE "household" DROP COLUMN "quotaSizeInBytes";`.execute(db);
}
