ALTER TABLE "Room" ADD COLUMN "invitationExpiresAt" DATETIME;
ALTER TABLE "Room" ADD COLUMN "invitationRevokedAt" DATETIME;
ALTER TABLE "Room" ADD COLUMN "engineState" TEXT;
ALTER TABLE "Room" ADD COLUMN "engineSequence" INTEGER NOT NULL DEFAULT 0;
UPDATE "Room" SET "invitationExpiresAt" = (CAST(strftime('%s', 'now') AS INTEGER) * 1000 + 86400000) WHERE "status" = 'WAITING';
