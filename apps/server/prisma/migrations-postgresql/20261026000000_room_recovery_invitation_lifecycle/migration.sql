ALTER TABLE "Room" ADD COLUMN "invitationExpiresAt" TIMESTAMP(3);
ALTER TABLE "Room" ADD COLUMN "invitationRevokedAt" TIMESTAMP(3);
ALTER TABLE "Room" ADD COLUMN "engineState" TEXT;
ALTER TABLE "Room" ADD COLUMN "engineSequence" INTEGER NOT NULL DEFAULT 0;
UPDATE "Room" SET "invitationExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '1 day' WHERE "status" = 'WAITING';
