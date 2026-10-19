BEGIN;

-- Add new columns to Room
ALTER TABLE "Room" ADD COLUMN "gameType" TEXT NOT NULL DEFAULT 'GUESS_NUMBER';
ALTER TABLE "Room" ADD COLUMN "customConfig" TEXT;

-- Drop obsolete guessNumber index and recreate RoomPlayer with nullable guessNumber and seatIndex
DROP INDEX IF EXISTS "RoomPlayer_roomId_guessNumber_key";

CREATE TABLE "new_RoomPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "guessNumber" INTEGER,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomPlayer_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_RoomPlayer" ("id", "roomId", "userId", "seatIndex", "status", "guessNumber", "joinedAt")
SELECT "id", "roomId", "userId", 0, 'ACTIVE', "guessNumber", "joinedAt" FROM "RoomPlayer";

DROP TABLE "RoomPlayer";
ALTER TABLE "new_RoomPlayer" RENAME TO "RoomPlayer";

CREATE UNIQUE INDEX "RoomPlayer_roomId_userId_key" ON "RoomPlayer"("roomId", "userId");
CREATE UNIQUE INDEX "RoomPlayer_roomId_seatIndex_key" ON "RoomPlayer"("roomId", "seatIndex");
CREATE INDEX "RoomPlayer_userId_idx" ON "RoomPlayer"("userId");

COMMIT;
