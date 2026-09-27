import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE "user"
    ADD "billingUploadRestricted" boolean NOT NULL DEFAULT false;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "user" DROP COLUMN "billingUploadRestricted";`.execute(db);
}
