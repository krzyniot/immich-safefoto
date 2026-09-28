import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "family_asset" (
    "assetId" uuid NOT NULL,
    "householdId" uuid NOT NULL,
    "hideFromPersonalTimeline" boolean NOT NULL DEFAULT false,
    "publishedAt" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
    "updatedAt" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT "family_asset_pkey" PRIMARY KEY ("assetId"),
    CONSTRAINT "family_asset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "family_asset_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household" ("id") ON UPDATE CASCADE ON DELETE CASCADE
  );`.execute(db);
  await sql`CREATE INDEX "family_asset_householdId_idx" ON "family_asset" ("householdId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "family_asset";`.execute(db);
}
