import { PrismaClient } from '@prisma/client';
import { authService } from './modules/auth/auth.service';
import { toPaise } from './money';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function initDbDefaults() {
  const adminUpi = await prisma.systemSetting.findUnique({
    where: { key: 'admin_upi_id' },
  });

  if (!adminUpi) {
    await prisma.systemSetting.createMany({
      data: [
        { key: 'admin_upi_id', value: process.env.ADMIN_UPI_ID || '8340271508@ptsbi' },
        { key: 'admin_upi_name', value: process.env.ADMIN_UPI_NAME || 'MoneyGame' },
        { key: 'platform_commission', value: process.env.PLATFORM_COMMISSION_PERCENT || '0' },
      ],
    });
  }

  // Seed default support contact channels if missing
  const supportEmail = await prisma.systemSetting.findUnique({ where: { key: 'support_email' } });
  if (!supportEmail) {
    await prisma.systemSetting.createMany({
      data: [
        { key: 'support_email', value: process.env.SUPPORT_EMAIL || 'support@moneygame.com' },
        { key: 'support_whatsapp', value: process.env.SUPPORT_WHATSAPP || '+91 98765 43210' },
        { key: 'support_telegram', value: process.env.SUPPORT_TELEGRAM || '@MoneyGameSupport' },
        { key: 'support_hours', value: '24/7 Live Support' },
      ],
    });
  }

  // Ensure tokenVersion column exists on User table
  await ensureTokenVersionColumn();

  // Seed Super Admin if none exists
  await authService.seedSuperAdmin();

  // Repair corrupted sports rooms from before the fixture fix
  await repairLegacySportsRooms();

  // Ensure notification table exists and sync historical records
  await syncHistoricalNotifications();
}

export async function ensureTokenVersionColumn() {
  try {
    const isPostgres = process.env.DATABASE_URL?.startsWith('postgres');
    if (isPostgres) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
      `);
    } else {
      const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("User");`);
      const hasCol = Array.isArray(tableInfo) && tableInfo.some((c: any) => c.name === 'tokenVersion');
      if (!hasCol) {
        await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;`);
      }
    }
  } catch (err: any) {
    // Ignore if column already exists
  }
}

export async function ensureNotificationTable() {
  try {
    const isPostgres = process.env.DATABASE_URL?.startsWith('postgres');
    if (isPostgres) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Notification" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "title" TEXT NOT NULL,
          "message" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "isRead" BOOLEAN NOT NULL DEFAULT false,
          "metadata" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");`);
    } else {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Notification" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "message" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "isRead" BOOLEAN NOT NULL DEFAULT false,
          "metadata" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");`);
    }
  } catch (err: any) {
    console.error('[Notification] ensureNotificationTable error:', err?.message || err);
  }
}

export async function syncHistoricalNotifications() {
  try {
    await ensureNotificationTable();

    // 1. Completed withdrawals
    const completedWithdrawals = await prisma.withdrawal.findMany({
      where: { status: 'COMPLETED' },
    });

    for (const w of completedWithdrawals) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: w.userId,
          metadata: { contains: w.id },
        },
      });

      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: w.userId,
            title: 'Withdrawal Completed',
            message: `Your withdrawal of ₹${w.amount.toFixed(2)} has been sent to your UPI ID (${w.upiId}). Bank Payout UTR: ${w.payoutUtr || 'N/A'}`,
            type: 'WITHDRAWAL_COMPLETED',
            metadata: JSON.stringify({
              withdrawalId: w.id,
              amount: w.amount,
              upiId: w.upiId,
              payoutUtr: w.payoutUtr,
            }),
            createdAt: w.updatedAt || w.createdAt,
          },
        });
      }
    }

    // 2. Completed rooms with winners
    const wonRooms = await prisma.room.findMany({
      where: { status: 'COMPLETED', winnerId: { not: null } },
    });

    for (const r of wonRooms) {
      if (!r.winnerId) continue;
      const existing = await prisma.notification.findFirst({
        where: {
          userId: r.winnerId,
          metadata: { contains: r.id },
        },
      });

      if (!existing) {
        const prize = r.winnerPrize || (toPaise(r.entryFee) * 2 * 0.9) / 100;
        await prisma.notification.create({
          data: {
            userId: r.winnerId,
            title: `Won Table #${r.roomCode}`,
            message: `Congratulations! You won ₹${prize.toFixed(2)} on Table #${r.roomCode} (${r.gameType}).`,
            type: 'ROOM_WIN',
            metadata: JSON.stringify({
              roomId: r.id,
              roomCode: r.roomCode,
              gameType: r.gameType,
              prize,
            }),
            createdAt: r.createdAt,
          },
        });
      }
    }

    // 3. Approved deposits
    const approvedDeposits = await prisma.deposit.findMany({
      where: { status: 'APPROVED' },
    });

    for (const d of approvedDeposits) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: d.userId,
          metadata: { contains: d.id },
        },
      });

      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: d.userId,
            title: 'Deposit Approved',
            message: `Deposit of ₹${d.baseAmount.toFixed(2)} has been credited to your wallet.${d.utr ? ` UTR: ${d.utr}` : ''}`,
            type: 'DEPOSIT_APPROVED',
            metadata: JSON.stringify({
              depositId: d.id,
              amount: d.baseAmount,
              utr: d.utr,
            }),
            createdAt: d.approvedAt || d.createdAt,
          },
        });
      }
    }
  } catch (err: any) {
    console.error('[Notification] syncHistoricalNotifications error:', err?.message || err);
  }
}

export async function repairLegacySportsRooms() {
  try {
    // Repair R-1E55C815 (New Zealand vs India) which was corrupted when joined before the fix
    const indNzRoom = await prisma.room.findUnique({ where: { roomCode: 'R-1E55C815' } });
    if (indNzRoom) {
      let cfg: any = {};
      try {
        if (indNzRoom.customConfig) cfg = JSON.parse(indNzRoom.customConfig);
      } catch (_) {}

      if (!cfg.matchTitle || cfg.team1?.name === 'Team 1') {
        const repaired = {
          matchId: 'espn-cricket-1539432',
          sport: 'Cricket',
          league: 'New Zealand vs India',
          matchTitle: 'New Zealand vs India',
          startTime: '2026-10-22T07:00:00Z',
          team1: {
            name: 'New Zealand',
            shortName: 'NZ',
            logo: 'https://a.espncdn.com/i/teamlogos/cricket/500/5.png',
          },
          team2: {
            name: 'India',
            shortName: 'IND',
            logo: 'https://a.espncdn.com/i/teamlogos/cricket/500/6.png',
          },
          isUnlimited: false,
          predictions: {
            '00d6c40f-7e3f-4127-afc9-e4729ea7e29e': {
              userId: '00d6c40f-7e3f-4127-afc9-e4729ea7e29e',
              username: 'pankaj',
              teamIndex: 1,
              teamName: 'New Zealand',
              selectedAt: '2026-10-20T18:17:48.642Z',
            },
            '628ddd3e-8181-47ab-bb5d-3a6d293e472b': {
              userId: '628ddd3e-8181-47ab-bb5d-3a6d293e472b',
              username: 'Gulshan Kumar',
              teamIndex: 2,
              teamName: 'India',
              selectedAt: '2026-10-20T18:19:15.706Z',
            },
          },
        };

        await prisma.room.update({
          where: { id: indNzRoom.id },
          data: {
            customConfig: JSON.stringify(repaired),
            status: 'WAITING',
          },
        });
        console.log('[Repair] Successfully restored Room #R-1E55C815 to New Zealand vs India fixture.');
      }
    }
  } catch (err: any) {
    console.error('[Repair] repairLegacySportsRooms error:', err?.message || err);
  }
}
