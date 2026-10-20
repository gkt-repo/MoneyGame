import { PrismaClient } from '@prisma/client';
import { authService } from './modules/auth/auth.service';

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

  // Seed Super Admin if none exists
  await authService.seedSuperAdmin();

  // Repair corrupted sports rooms from before the fixture fix
  await repairLegacySportsRooms();
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
