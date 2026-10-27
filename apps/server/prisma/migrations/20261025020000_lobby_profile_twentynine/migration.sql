-- AlterTable
ALTER TABLE "Room" ADD COLUMN "invitationToken" TEXT;
ALTER TABLE "Room" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Room_invitationToken_key" ON "Room"("invitationToken");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN "avatar" TEXT DEFAULT 'avatar_1';
