import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "household" (
  "id" uuid NOT NULL DEFAULT immich_uuid_v7(),
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "household_pkey" PRIMARY KEY ("id")
);`.execute(db);

  await sql`ALTER TABLE "user" ADD "householdId" uuid;`.execute(db);

  // immich_uuid_v7() is evaluated once per row, yielding one household per
  // existing user. This intentionally does not inspect sharing relationships.
  await sql`UPDATE "user" SET "householdId" = immich_uuid_v7();`.execute(db);
  await sql`INSERT INTO "household" ("id") SELECT "householdId" FROM "user";`.execute(db);

  await sql`DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM "user" WHERE "householdId" IS NULL) THEN
      RAISE EXCEPTION 'SafeFoto household backfill left users without a household';
    END IF;

    IF EXISTS (
      SELECT "householdId"
      FROM "user"
      GROUP BY "householdId"
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'SafeFoto household backfill assigned multiple users to one household';
    END IF;
  END
  $$;`.execute(db);

  await sql`ALTER TABLE "user" ALTER COLUMN "householdId" SET NOT NULL;`.execute(db);
  await sql`ALTER TABLE "user" ADD CONSTRAINT "user_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;`.execute(
    db,
  );
  await sql`CREATE INDEX "user_householdId_idx" ON "user" ("householdId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX "user_householdId_idx";`.execute(db);
  await sql`ALTER TABLE "user" DROP CONSTRAINT "user_householdId_fkey";`.execute(db);
  await sql`ALTER TABLE "user" DROP COLUMN "householdId";`.execute(db);
  await sql`DROP TABLE "household";`.execute(db);
}
