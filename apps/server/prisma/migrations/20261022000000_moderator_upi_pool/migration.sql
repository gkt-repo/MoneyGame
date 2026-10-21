-- Add UpiAccount table for UPI pool rotation
CREATE TABLE "UpiAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "upiId" TEXT NOT NULL,
    "receiverName" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 15,
    "todayTxCount" INTEGER NOT NULL DEFAULT 0,
    "batchCount" INTEGER NOT NULL DEFAULT 0,
    "batchSize" INTEGER NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedUserId" TEXT,
    "lastResetAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create unique index on upiId
CREATE UNIQUE INDEX "UpiAccount_upiId_key" ON "UpiAccount"("upiId");

-- Create unique index on assignedUserId
CREATE UNIQUE INDEX "UpiAccount_assignedUserId_key" ON "UpiAccount"("assignedUserId");

-- Create performance indexes
CREATE INDEX "UpiAccount_isActive_sortOrder_idx" ON "UpiAccount"("isActive", "sortOrder");
CREATE INDEX "UpiAccount_assignedUserId_idx" ON "UpiAccount"("assignedUserId");
