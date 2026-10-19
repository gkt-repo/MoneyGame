BEGIN;

-- DropIndex
DROP INDEX "Deposit_totalAmount_key";

-- AlterTable
ALTER TABLE "Deposit" ADD COLUMN "activeAmountKey" INTEGER;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN "winnerPrize" REAL;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_activeAmountKey_key" ON "Deposit"("activeAmountKey");

-- CreateIndex
CREATE INDEX "Deposit_totalAmount_idx" ON "Deposit"("totalAmount");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");


-- Reserve existing pending amounts before accepting any new requests.
-- Original totalAmount uniqueness ensures this backfill cannot collide.
UPDATE "Deposit" SET "activeAmountKey" = CAST(ROUND("totalAmount" * 100) AS INTEGER)
WHERE "status" IN ('PENDING', 'CLAIMED');

-- Preserve actual payouts for historical games in both clients.
UPDATE "Room" SET "winnerPrize" = (
  SELECT SUM("amount") FROM "Transaction"
  WHERE "referenceId" = "Room"."id" AND "type" = 'ROOM_WIN' AND "userId" = "Room"."winnerId"
) WHERE "status" = 'COMPLETED';

-- Canonical bank references must remain unique. Existing collisions stop the
-- migration for reconciliation instead of silently merging financial records.
UPDATE "Deposit" SET "utr" = UPPER(TRIM("utr")), "userClaimedUtr" = UPPER(TRIM("userClaimedUtr"));
UPDATE "UnmatchedPayment" SET "utr" = UPPER(TRIM("utr"));
UPDATE "Withdrawal" SET "payoutUtr" = UPPER(TRIM("payoutUtr"));
COMMIT;
