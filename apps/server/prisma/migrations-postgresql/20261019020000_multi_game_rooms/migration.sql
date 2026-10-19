BEGIN;

-- Add new columns to Room
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "gameType" TEXT NOT NULL DEFAULT 'GUESS_NUMBER';
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "customConfig" TEXT;

-- Update RoomPlayer
ALTER TABLE "RoomPlayer" ADD COLUMN IF NOT EXISTS "seatIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RoomPlayer" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "RoomPlayer" ALTER COLUMN "guessNumber" DROP NOT NULL;

DROP INDEX IF EXISTS "RoomPlayer_roomId_guessNumber_key";

CREATE UNIQUE INDEX IF NOT EXISTS "RoomPlayer_roomId_seatIndex_key" ON "RoomPlayer"("roomId", "seatIndex");

COMMIT;
