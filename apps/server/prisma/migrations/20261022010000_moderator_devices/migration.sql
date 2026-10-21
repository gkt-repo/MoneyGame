-- Add the relation absent from the original pool migration while retaining rows.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
UPDATE "UpiAccount" SET "assignedUserId" = NULL WHERE "assignedUserId" NOT IN (SELECT "id" FROM "User");
CREATE TABLE "new_UpiAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "upiId" TEXT NOT NULL,
    "receiverName" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 15,
    "todayTxCount" INTEGER NOT NULL DEFAULT 0,
    "batchCount" INTEGER NOT NULL DEFAULT 0,
    "batchSize" INTEGER NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "lastResetAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_UpiAccount" SELECT * FROM "UpiAccount";
DROP TABLE "UpiAccount";
ALTER TABLE "new_UpiAccount" RENAME TO "UpiAccount";
-- Create unique index on upiId
CREATE UNIQUE INDEX "UpiAccount_upiId_key" ON "UpiAccount"("upiId");

-- Create unique index on assignedUserId
CREATE UNIQUE INDEX "UpiAccount_assignedUserId_key" ON "UpiAccount"("assignedUserId");

-- Create performance indexes
CREATE INDEX "UpiAccount_isActive_sortOrder_idx" ON "UpiAccount"("isActive", "sortOrder");
CREATE INDEX "UpiAccount_assignedUserId_idx" ON "UpiAccount"("assignedUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

ALTER TABLE "Deposit" ADD COLUMN "upiAccountId" TEXT;
ALTER TABLE "Deposit" ADD COLUMN "allocationDay" TEXT;
ALTER TABLE "UnmatchedPayment" ADD COLUMN "receivingUpi" TEXT;
ALTER TABLE "UnmatchedPayment" ADD COLUMN "reportedById" TEXT;
ALTER TABLE "Withdrawal" ADD COLUMN "processingById" TEXT;
ALTER TABLE "Withdrawal" ADD COLUMN "processedById" TEXT;
ALTER TABLE "UpiAccount" ADD COLUMN "listenerTokenHash" TEXT;
ALTER TABLE "UpiAccount" ADD COLUMN "lastHeartbeatAt" DATETIME;
ALTER TABLE "UpiAccount" ADD COLUMN "listenerConnected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UpiAccount" ADD COLUMN "batteryLevel" INTEGER;
ALTER TABLE "UpiAccount" ADD COLUMN "phoneModel" TEXT;
CREATE UNIQUE INDEX "UpiAccount_listenerTokenHash_key" ON "UpiAccount"("listenerTokenHash");
CREATE TABLE "UpiDailyUsage" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "accountId" TEXT NOT NULL,
 "day" TEXT NOT NULL,
 "issuedCount" INTEGER NOT NULL DEFAULT 0,
 "receivedCount" INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY ("accountId") REFERENCES "UpiAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UpiDailyUsage_accountId_day_key" ON "UpiDailyUsage"("accountId", "day");

-- Preserve already-issued pool requests when upgrading an installation.
UPDATE "Deposit" SET "upiAccountId" = (SELECT "id" FROM "UpiAccount" WHERE "UpiAccount"."upiId" = "Deposit"."receivingUpi"),
 "allocationDay" = strftime('%Y-%m-%d', CASE WHEN typeof("createdAt") = 'integer' THEN datetime("createdAt" / 1000, 'unixepoch', '+330 minutes') ELSE datetime("createdAt", '+330 minutes') END)
WHERE EXISTS (SELECT 1 FROM "UpiAccount" WHERE "UpiAccount"."upiId" = "Deposit"."receivingUpi");
INSERT INTO "UpiDailyUsage" ("id", "accountId", "day", "issuedCount", "receivedCount")
SELECT lower(hex(randomblob(16))), "upiAccountId", "allocationDay", COUNT(*), SUM(CASE WHEN "status" = 'APPROVED' THEN 1 ELSE 0 END)
FROM "Deposit" WHERE "upiAccountId" IS NOT NULL AND "allocationDay" IS NOT NULL
GROUP BY "upiAccountId", "allocationDay";
