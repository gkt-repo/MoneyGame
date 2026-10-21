ALTER TABLE "Deposit" ADD COLUMN "upiAccountId" TEXT;
ALTER TABLE "Deposit" ADD COLUMN "allocationDay" TEXT;
ALTER TABLE "UnmatchedPayment" ADD COLUMN "receivingUpi" TEXT;
ALTER TABLE "UnmatchedPayment" ADD COLUMN "reportedById" TEXT;
ALTER TABLE "Withdrawal" ADD COLUMN "processingById" TEXT;
ALTER TABLE "Withdrawal" ADD COLUMN "processedById" TEXT;
ALTER TABLE "UpiAccount" ADD COLUMN "listenerTokenHash" TEXT;
ALTER TABLE "UpiAccount" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);
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
 "allocationDay" = to_char("createdAt" + interval '330 minutes', 'YYYY-MM-DD')
WHERE EXISTS (SELECT 1 FROM "UpiAccount" WHERE "UpiAccount"."upiId" = "Deposit"."receivingUpi");
INSERT INTO "UpiDailyUsage" ("id", "accountId", "day", "issuedCount", "receivedCount")
SELECT md5("upiAccountId" || "allocationDay"), "upiAccountId", "allocationDay", COUNT(*), SUM(CASE WHEN "status" = 'APPROVED' THEN 1 ELSE 0 END)
FROM "Deposit" WHERE "upiAccountId" IS NOT NULL AND "allocationDay" IS NOT NULL
GROUP BY "upiAccountId", "allocationDay";
