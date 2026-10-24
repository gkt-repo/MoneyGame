-- CreateTable
CREATE TABLE "TradingMarket" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'TEST',
    "title" TEXT NOT NULL,
    "team0" TEXT NOT NULL,
    "team1" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUSPENDED',
    "reason" TEXT NOT NULL DEFAULT '',
    "rulesVersion" TEXT NOT NULL DEFAULT 'pooled-v1',
    "modelVersion" TEXT NOT NULL DEFAULT 'cricket-baseline-v1',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "snapshot" TEXT NOT NULL DEFAULT '{}',
    "feedReceivedAt" TIMESTAMP(3),
    "snapshotChangedAt" TIMESTAMP(3),
    "winner" INTEGER,
    "adminPaused" BOOLEAN NOT NULL DEFAULT false,
    "replayStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradingMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingQuote" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "price0" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingAccount" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deposit" INTEGER NOT NULL DEFAULT 0,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "realized" INTEGER NOT NULL DEFAULT 0,
    "receipt" TEXT,

    CONSTRAINT "TradingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingPosition" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "outcome" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "cost" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TradingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingExecution" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "outcome" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradingExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingOperation" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradingOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingLease" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "nextPollAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingLease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradingQuote_marketId_publishedAt_idx" ON "TradingQuote"("marketId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradingQuote_marketId_sequence_key" ON "TradingQuote"("marketId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "TradingAccount_marketId_userId_key" ON "TradingAccount"("marketId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TradingPosition_accountId_outcome_key" ON "TradingPosition"("accountId", "outcome");

-- CreateIndex
CREATE INDEX "TradingExecution_accountId_createdAt_idx" ON "TradingExecution"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradingOperation_marketId_userId_requestId_key" ON "TradingOperation"("marketId", "userId", "requestId");

-- AddForeignKey
ALTER TABLE "TradingQuote" ADD CONSTRAINT "TradingQuote_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "TradingMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "TradingMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingPosition" ADD CONSTRAINT "TradingPosition_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingExecution" ADD CONSTRAINT "TradingExecution_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingOperation" ADD CONSTRAINT "TradingOperation_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "TradingMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

