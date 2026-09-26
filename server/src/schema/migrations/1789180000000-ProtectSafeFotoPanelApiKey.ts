import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "api_key" ADD "isSystemManaged" boolean NOT NULL DEFAULT false;`.execute(db);
  await sql`
    UPDATE "api_key"
    SET "isSystemManaged" = true
    WHERE lower("name") LIKE 'safefoto%panel%'
      AND "permissions" @> ARRAY['adminUser.read', 'adminUser.create', 'adminUser.update']::varchar[];
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "api_key" DROP COLUMN "isSystemManaged";`.execute(db);
}
