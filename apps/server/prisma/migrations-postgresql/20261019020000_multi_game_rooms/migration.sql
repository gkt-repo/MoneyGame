BEGIN;

-- Add new columns to Room
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "gameType" TEXT NOT NULL DEFAULT 'GUESS_NUMBER';
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "customConfig" TEXT;

-- Update RoomPlayer
ALTER TABLE "RoomPlayer" ADD COLUMN IF NOT EXISTS "seatIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RoomPlayer" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "RoomPlayer" ALTER COLUMN "guessNumber" DROP NOT NULL;

-- Backfill seatIndex so existing players in the same room get distinct seat indexes (0, 1, 2...)
UPDATE "RoomPlayer"
SET "seatIndex" = sub.row_num
FROM (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY "roomId" ORDER BY "joinedAt" ASC) - 1) AS row_num
  FROM "RoomPlayer"
) sub
WHERE "RoomPlayer".id = sub.id;

DROP INDEX IF EXISTS "RoomPlayer_roomId_guessNumber_key";
DROP INDEX IF EXISTS "RoomPlayer_roomId_seatIndex_key";

CREATE UNIQUE INDEX "RoomPlayer_roomId_seatIndex_key" ON "RoomPlayer"("roomId", "seatIndex");

COMMIT;
