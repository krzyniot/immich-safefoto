import { Kysely, sql } from 'kysely';

const householdAwareFunctionOverride = String.raw`{"type":"function","name":"user_delete_audit","sql":"CREATE OR REPLACE FUNCTION user_delete_audit()\n  RETURNS TRIGGER\n  LANGUAGE PLPGSQL\n  AS $$\n    BEGIN\n      INSERT INTO user_audit (\"userId\", \"householdId\")\n      SELECT \"id\", \"householdId\"\n      FROM OLD;\n      RETURN NULL;\n    END\n  $$;"}`;

const legacyFunctionOverride = String.raw`{"type":"function","name":"user_delete_audit","sql":"CREATE OR REPLACE FUNCTION user_delete_audit()\n  RETURNS TRIGGER\n  LANGUAGE PLPGSQL\n  AS $$\n    BEGIN\n      INSERT INTO user_audit (\"userId\")\n      SELECT \"id\"\n      FROM OLD;\n      RETURN NULL;\n    END\n  $$;"}`;

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "user_audit" ADD "householdId" uuid;`.execute(db);

  // Legacy rows cannot be attributed safely after their user has been hard
  // deleted. Discarding them is fail-closed and avoids guessing from sharing.
  await sql`TRUNCATE TABLE "user_audit";`.execute(db);
  await sql`ALTER TABLE "user_audit" ALTER COLUMN "householdId" SET NOT NULL;`.execute(db);
  await sql`CREATE INDEX "user_audit_householdId_idx" ON "user_audit" ("householdId");`.execute(db);

  await sql`CREATE OR REPLACE FUNCTION user_delete_audit()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
  AS $$
    BEGIN
      INSERT INTO user_audit ("userId", "householdId")
      SELECT "id", "householdId"
      FROM OLD;
      RETURN NULL;
    END
  $$;`.execute(db);
  await sql`UPDATE "migration_overrides" SET "value" = ${householdAwareFunctionOverride}::jsonb WHERE "name" = 'function_user_delete_audit';`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`CREATE OR REPLACE FUNCTION user_delete_audit()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
  AS $$
    BEGIN
      INSERT INTO user_audit ("userId")
      SELECT "id"
      FROM OLD;
      RETURN NULL;
    END
  $$;`.execute(db);
  await sql`UPDATE "migration_overrides" SET "value" = ${legacyFunctionOverride}::jsonb WHERE "name" = 'function_user_delete_audit';`.execute(
    db,
  );

  await sql`DROP INDEX "user_audit_householdId_idx";`.execute(db);
  await sql`ALTER TABLE "user_audit" DROP COLUMN "householdId";`.execute(db);
}
