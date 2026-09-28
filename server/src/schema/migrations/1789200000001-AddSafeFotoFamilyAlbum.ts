import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "family_album" (
    "albumId" uuid NOT NULL,
    "householdId" uuid NOT NULL,
    "defaultMode" varchar(8) NOT NULL,
    "publishedAt" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
    "updatedAt" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT "family_album_pkey" PRIMARY KEY ("albumId"),
    CONSTRAINT "family_album_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "album" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "family_album_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "family_album_mode_check" CHECK ("defaultMode" IN ('share', 'move'))
  );`.execute(db);
  await sql`CREATE INDEX "family_album_householdId_idx" ON "family_album" ("householdId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "family_album";`.execute(db);
}
