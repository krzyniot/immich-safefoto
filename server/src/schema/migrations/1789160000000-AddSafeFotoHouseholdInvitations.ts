import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE "household_invitation" (
      "id" uuid NOT NULL DEFAULT immich_uuid_v7() PRIMARY KEY,
      "householdId" uuid NOT NULL REFERENCES "household" ("id") ON DELETE CASCADE,
      "adminId" uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
      "inviteeId" uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
      "status" varchar(16) NOT NULL CHECK ("status" IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "resolvedAt" timestamptz
    );
  `.execute(db);
  await sql`CREATE UNIQUE INDEX "household_invitation_pending_idx" ON "household_invitation" ("householdId", "inviteeId") WHERE "status" = 'PENDING';`.execute(db);
  await sql`CREATE INDEX "household_invitation_invitee_idx" ON "household_invitation" ("inviteeId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "household_invitation";`.execute(db);
}
