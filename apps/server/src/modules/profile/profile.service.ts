import { prisma } from '../../db';
import {
  UserProfileDTO,
  PublicProfileDTO,
  UpdateProfileDTO,
  CURATED_AVATARS,
  CuratedAvatar,
} from '@moneygame/shared-types';

export class ProfileService {
  async getUserProfile(userId: string): Promise<UserProfileDTO> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) throw new Error('User not found');

    const statsAndHistory = await this.calculateUserStatsAndHistory(userId);

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      avatar: user.avatar || 'avatar_1',
      phone: user.phone,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      stats: statsAndHistory.stats,
      recentGames: statsAndHistory.recentGames,
    };
  }

  async getPublicProfile(userId: string): Promise<PublicProfileDTO> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        createdAt: true,
      },
    });

    if (!user) throw new Error('User not found');

    const statsAndHistory = await this.calculateUserStatsAndHistory(userId);

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      avatar: user.avatar || 'avatar_1',
      createdAt: user.createdAt.toISOString(),
      stats: statsAndHistory.stats,
    };
  }

  async updateProfile(userId: string, data: UpdateProfileDTO): Promise<UserProfileDTO> {
    const updates: { displayName?: string; avatar?: string } = {};

    if (data.displayName !== undefined) {
      if (typeof data.displayName !== 'string') throw new Error('Display name must be text');
      const trimmed = data.displayName.trim();
      if (trimmed.length < 2 || trimmed.length > 30) {
        throw new Error('Display name must be between 2 and 30 characters');
      }
      // Sanitization: Allow alphanumeric, spaces, underscores, dots, hyphens
      if (!/^[a-zA-Z0-9 _.-]+$/.test(trimmed)) {
        throw new Error('Display name contains invalid characters');
      }
      updates.displayName = trimmed;
    }

    if (data.avatar !== undefined) {
      if (!CURATED_AVATARS.includes(data.avatar as CuratedAvatar)) {
        throw new Error('Invalid avatar selection');
      }
      updates.avatar = data.avatar;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: updates,
      });
    }

    return this.getUserProfile(userId);
  }

  private async calculateUserStatsAndHistory(userId: string) {
    // Only completed games count toward stats. CANCELLED or refunded rooms are excluded!
    const roomParticipations = await prisma.roomPlayer.findMany({
      where: {
        userId,
        room: { status: 'COMPLETED' },
      },
      include: {
        room: true,
      },
      orderBy: {
        room: { createdAt: 'desc' },
      },
    });

    const settlements = await prisma.transaction.findMany({
      where: { referenceId: { in: roomParticipations.map(p => p.roomId) }, type: 'ROOM_WIN' },
      select: { referenceId: true, createdAt: true }, orderBy: { createdAt: 'desc' },
    });
    const settledDates = new Map<string, string>();
    for (const row of settlements) if (row.referenceId && !settledDates.has(row.referenceId)) settledDates.set(row.referenceId, row.createdAt.toISOString());
    const byGame: Record<string, { played: number; won: number; winRatePercent: number }> = {};
    let totalGames = 0;
    let totalWins = 0;
    const recentGames: any[] = [];

    for (const p of roomParticipations) {
      const room = p.room;
      const gameType = room.gameType;

      let isWin = false;
      let prize = 0;

      // Special handling for 29 Card Game partnership team wins
      if (gameType === 'TWENTY_NINE' && room.customConfig) {
        try {
          const config = JSON.parse(room.customConfig);
          if (Array.isArray(config.winnerUserIds) && config.winnerUserIds.includes(userId)) {
            isWin = true;
            if (Array.isArray(config.payouts)) {
              const myPayout = config.payouts.find((row: any) => row.userId === userId);
              if (myPayout) prize = myPayout.amount;
            }
          }
        } catch (_) {}
      } else if (gameType === 'SPORTS_MATCH' && room.customConfig) {
        try {
          const config = JSON.parse(room.customConfig);
          const settlement = config.settlement;
          if (settlement && Array.isArray(settlement.winnerUserIds) && settlement.winnerUserIds.includes(userId)) {
            isWin = true;
            prize = typeof settlement.payoutPerWinner === 'number' ? settlement.payoutPerWinner : 0;
          }
        } catch (_) {}
      } else if (room.winnerId === userId) {
        isWin = true;
        prize = room.winnerPrize || 0;
      }

      totalGames++;
      if (isWin) totalWins++;

      if (!byGame[gameType]) {
        byGame[gameType] = { played: 0, won: 0, winRatePercent: 0 };
      }
      byGame[gameType].played++;
      if (isWin) byGame[gameType].won++;

      {
        recentGames.push({
          roomId: room.id,
          roomCode: room.roomCode,
          gameType: room.gameType,
          entryFee: room.entryFee,
          isWin,
          prize,
          settledAt: settledDates.get(room.id) || room.createdAt.toISOString(),
        });
      }
    }

    for (const g of Object.values(byGame)) {
      g.winRatePercent = g.played > 0 ? Math.round((g.won / g.played) * 100) : 0;
    }

    const winRatePercent = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

    return {
      stats: {
        totalGames,
        totalWins,
        winRatePercent,
        byGame,
      },
      recentGames: recentGames.sort((a, b) => b.settledAt.localeCompare(a.settledAt)).slice(0, 10),
    };
  }
}

export const profileService = new ProfileService();
