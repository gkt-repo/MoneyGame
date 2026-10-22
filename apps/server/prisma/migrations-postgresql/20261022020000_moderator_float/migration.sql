ALTER TABLE "Withdrawal" ADD COLUMN "assignedModeratorId" TEXT;
ALTER TABLE "Withdrawal" ADD COLUMN "assignedAt" TIMESTAMP(3);
ALTER TABLE "Withdrawal" ADD COLUMN "payoutAccountId" TEXT;
ALTER TABLE "Withdrawal" ADD COLUMN "fundingSource" TEXT;
CREATE INDEX "Withdrawal_assignedModeratorId_status_idx" ON "Withdrawal"("assignedModeratorId", "status");
CREATE INDEX "Withdrawal_status_assignedAt_idx" ON "Withdrawal"("status", "assignedAt");
ALTER TABLE "UpiAccount" ADD COLUMN "totalDeposited" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "UpiAccount" ADD COLUMN "totalPaidOut" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "UpiAccount" ADD COLUMN "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "UpiAccount" ADD COLUMN "reservedPayouts" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "UpiAccount" ADD COLUMN "openingAdjustment" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "UpiAccount" ADD COLUMN "floatReady" BOOLEAN NOT NULL DEFAULT true;
-- Historical payouts have no reliable bank-account provenance. Do not invent it.
UPDATE "UpiAccount" SET "floatReady" = false;
CREATE TABLE "CashDeskEntry" (
 "id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL, "amount" DOUBLE PRECISION NOT NULL,
 "kind" TEXT NOT NULL, "sourceKey" TEXT NOT NULL, "actorId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CashDeskEntry_sourceKey_key" ON "CashDeskEntry"("sourceKey");
CREATE INDEX "CashDeskEntry_accountId_createdAt_idx" ON "CashDeskEntry"("accountId", "createdAt");
INSERT INTO "CashDeskEntry" ("id", "accountId", "amount", "kind", "sourceKey")
 SELECT 'deposit:' || d."id", a."id", d."totalAmount", 'DEPOSIT', 'deposit:' || d."id"
 FROM "Deposit" d JOIN "UpiAccount" a ON a."upiId" = d."receivingUpi"
 WHERE d."status" = 'APPROVED';
INSERT INTO "CashDeskEntry" ("id", "accountId", "amount", "kind", "sourceKey")
 SELECT 'receipt:' || r."id", a."id", r."amount", 'DEPOSIT', 'receipt:' || r."id"
 FROM "UnmatchedPayment" r JOIN "UpiAccount" a ON a."upiId" = r."receivingUpi"
 WHERE r."status" = 'ASSIGNED' AND r."assignedDepositId" IS NULL
 AND NOT EXISTS (SELECT 1 FROM "Deposit" d WHERE d."utr" = r."utr" AND d."status" = 'APPROVED');
UPDATE "UpiAccount" SET "totalDeposited" = COALESCE((SELECT SUM(e."amount") FROM "CashDeskEntry" e WHERE e."accountId" = "UpiAccount"."id"), 0);
UPDATE "UpiAccount" SET "currentBalance" = "totalDeposited";
-- Retain visibility of legacy claimed payouts; they are never auto-reassigned.
UPDATE "Withdrawal" SET "assignedModeratorId" = "processingById"
 WHERE "status" = 'PROCESSING' AND "processingById" IN (SELECT "id" FROM "User" WHERE "role" = 'MODERATOR');
