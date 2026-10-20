import { prisma } from '../../db';
import { serializable } from '../../transaction';
import { walletService, getEffectiveCommissionPercent } from '../wallet/wallet.service';
import { paymentService } from '../payment/payment.service';
import { notificationService } from '../notification/notification.service';
import { toPaise } from '../../money';

export class AdminService {
  /**
   * Get admin dashboard overview stats
   */
  async getDashboardStats() {
    const totalUsers = await prisma.user.count();
    const deposits = await prisma.deposit.findMany();
    const withdrawals = await prisma.withdrawal.findMany();
    const rooms = await prisma.room.findMany({
      include: {
        players: { select: { id: true, userId: true } },
      },
    });
    const assignedPayments = await prisma.unmatchedPayment.findMany({ where: { status: 'ASSIGNED' } });
    const assignedVolume = assignedPayments.reduce((acc, u) => acc + u.amount, 0);

    const completedDeposits = deposits.filter((d) => d.status === 'APPROVED');
    const pendingDeposits = deposits.filter((d) => d.status === 'PENDING');
    const totalDepositVolume = completedDeposits.reduce((acc, d) => acc + d.baseAmount, 0) + assignedVolume;

    const pendingWithdrawals = withdrawals.filter((w) => w.status === 'PENDING');
    const completedWithdrawals = withdrawals.filter((w) => w.status === 'COMPLETED');
    const totalPayoutVolume = completedWithdrawals.reduce((acc, w) => acc + w.amount, 0);

    const activeRooms = rooms.filter((r) => ['WAITING', 'COUNTDOWN', 'ROLLING', 'PLAYING'].includes(r.status));
    const completedRooms = rooms.filter((r) => r.status === 'COMPLETED');

    const adminUpi = await prisma.systemSetting.findUnique({
      where: { key: 'admin_upi_id' },
    });
    const adminName = await prisma.systemSetting.findUnique({
      where: { key: 'admin_upi_name' },
    });
    const commissionPercent = await getEffectiveCommissionPercent();
    let totalRoomVolume = 0;
    let platformProfit = 0;

    for (const r of completedRooms) {
      let configObj: Record<string, any> = {};
      try {
        if (r.customConfig) configObj = JSON.parse(r.customConfig);
      } catch (_) {}

      let roomPool = 0;
      let roomCommission = 0;

      // 1. Check for explicit commission recorded in customConfig or settlement metadata
      const explicitCommission = typeof configObj.platformCommission === 'number'
        ? configObj.platformCommission
        : typeof configObj.settlement?.commissionAmount === 'number'
          ? configObj.settlement.commissionAmount
          : null;

      // 2. Check for explicit settled pool / total pot
      const explicitPool = typeof configObj.settledPool === 'number'
        ? configObj.settledPool
        : typeof configObj.settlement?.totalPot === 'number'
          ? configObj.settlement.totalPot
          : null;

      if (explicitCommission !== null) {
        roomCommission = explicitCommission;
        roomPool = explicitPool !== null
          ? explicitPool
          : (r.winnerPrize != null ? (toPaise(r.winnerPrize) + toPaise(roomCommission)) / 100 : roomCommission);
      } else if (explicitPool !== null) {
        roomPool = explicitPool;
        roomCommission = r.winnerPrize != null
          ? (toPaise(roomPool) - toPaise(r.winnerPrize)) / 100
          : (roomPool * commissionPercent) / 100;
      } else {
        // Fallback: strictly calculate using actual participating players (never max room capacity)
        const participantsCount = Array.isArray(r.players) && r.players.length > 0
          ? r.players.length
          : configObj.predictions && typeof configObj.predictions === 'object'
            ? Object.keys(configObj.predictions).length
            : 0;

        if (configObj.playerStakes) {
          const inGameStakes = Object.values(configObj.playerStakes as Record<string, number>).reduce(
            (a, b) => a + (typeof b === 'number' ? b : 0),
            0
          );
          roomPool = r.entryFee * participantsCount + inGameStakes;
        } else {
          roomPool = r.entryFee * participantsCount;
        }

        if (r.winnerPrize != null && r.winnerPrize > 0) {
          roomCommission = (toPaise(roomPool) - toPaise(r.winnerPrize)) / 100;
        } else {
          roomCommission = (roomPool * commissionPercent) / 100;
        }
      }

      totalRoomVolume += roomPool;
      platformProfit += Math.max(0, roomCommission);
    }

    const openFeedbacksCount = await prisma.feedback.count({
      where: { status: 'OPEN' },
    });

    const supportEmail = await prisma.systemSetting.findUnique({ where: { key: 'support_email' } });
    const supportWhatsapp = await prisma.systemSetting.findUnique({ where: { key: 'support_whatsapp' } });
    const supportTelegram = await prisma.systemSetting.findUnique({ where: { key: 'support_telegram' } });
    const supportHours = await prisma.systemSetting.findUnique({ where: { key: 'support_hours' } });

    // Listener phone watchdog status (Online if heartbeat within 3 minutes)
    const lastHeartbeat = await prisma.systemSetting.findUnique({ where: { key: 'last_listener_heartbeat' } });
    const listenerMeta = await prisma.systemSetting.findUnique({ where: { key: 'listener_metadata' } });
    let listenerStatus: 'ONLINE' | 'OFFLINE' = 'OFFLINE';
    let lastHeartbeatAt: string | null = null;
    let listenerMetadata: any = null;

    if (lastHeartbeat?.value) {
      lastHeartbeatAt = lastHeartbeat.value;
      const diffMs = Date.now() - new Date(lastHeartbeat.value).getTime();
      if (diffMs >= 0 && diffMs < 180000) {
        listenerStatus = 'ONLINE';
      }
    }
    if (listenerMeta?.value) {
      try { listenerMetadata = JSON.parse(listenerMeta.value); } catch { /* ignore */ }
    }

    return {
      totalUsers,
      totalUsersCount: totalUsers,
      totalDepositVolume,
      totalDeposited: totalDepositVolume,
      totalPayoutVolume,
      totalWithdrawn: totalPayoutVolume,
      platformProfit,
      activeRooms: activeRooms.length,
      completedDepositsCount: completedDeposits.length,
      pendingDepositsCount: pendingDeposits.length,
      pendingWithdrawalsCount: pendingWithdrawals.length,
      openFeedbacksCount,
      completedRoomsCount: completedRooms.length,
      adminUpiId: adminUpi?.value || 'admin@okhdfcbank',
      adminUpiName: adminName?.value || 'MoneyGame Admin',
      commissionPercent: String(commissionPercent),
      supportEmail: supportEmail?.value || 'support@moneygame.com',
      supportWhatsapp: supportWhatsapp?.value || '+91 98765 43210',
      supportTelegram: supportTelegram?.value || '@MoneyGameSupport',
      supportHours: supportHours?.value || '24/7 Live Support',
      listenerStatus,
      lastHeartbeatAt,
      listenerMetadata,
    };
  }

  /**
   * Update active receiving UPI ID
   */
  async updateUpiSettings(upiId: string, upiName: string) {
    if (!upiId || !upiId.includes('@')) throw new Error('Invalid UPI ID');

    await prisma.systemSetting.upsert({
      where: { key: 'admin_upi_id' },
      update: { value: upiId },
      create: { key: 'admin_upi_id', value: upiId },
    });

    if (upiName) {
      await prisma.systemSetting.upsert({
        where: { key: 'admin_upi_name' },
        update: { value: upiName },
        create: { key: 'admin_upi_name', value: upiName },
      });
    }

    return { success: true, upiId, upiName };
  }

  /**
   * Fetch current support contact configuration
   */
  async getSupportContactSettings() {
    const email = await prisma.systemSetting.findUnique({ where: { key: 'support_email' } });
    const whatsapp = await prisma.systemSetting.findUnique({ where: { key: 'support_whatsapp' } });
    const telegram = await prisma.systemSetting.findUnique({ where: { key: 'support_telegram' } });
    const hours = await prisma.systemSetting.findUnique({ where: { key: 'support_hours' } });

    return {
      email: email?.value || 'support@moneygame.com',
      whatsapp: whatsapp?.value || '+91 98765 43210',
      telegram: telegram?.value || '@MoneyGameSupport',
      hours: hours?.value || '24/7 Live Support',
      upiHelpText: 'For deposit issues, please provide your 12-digit UTR / UPI Reference ID.',
    };
  }

  /**
   * Update support contact channels (Email, WhatsApp, Telegram, Hours)
   */
  async updateSupportSettings(
    settings: { email?: string; whatsapp?: string; telegram?: string; hours?: string },
    adminId?: string
  ) {
    if (settings.email !== undefined) {
      const email = settings.email.trim();
      if (email && !email.includes('@')) throw new Error('Invalid support email address');
      await prisma.systemSetting.upsert({
        where: { key: 'support_email' },
        update: { value: email },
        create: { key: 'support_email', value: email },
      });
    }

    if (settings.whatsapp !== undefined) {
      const whatsapp = settings.whatsapp.trim();
      await prisma.systemSetting.upsert({
        where: { key: 'support_whatsapp' },
        update: { value: whatsapp },
        create: { key: 'support_whatsapp', value: whatsapp },
      });
    }

    if (settings.telegram !== undefined) {
      const telegram = settings.telegram.trim();
      await prisma.systemSetting.upsert({
        where: { key: 'support_telegram' },
        update: { value: telegram },
        create: { key: 'support_telegram', value: telegram },
      });
    }

    if (settings.hours !== undefined) {
      const hours = settings.hours.trim();
      await prisma.systemSetting.upsert({
        where: { key: 'support_hours' },
        update: { value: hours },
        create: { key: 'support_hours', value: hours },
      });
    }

    if (adminId) {
      await prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: 'UPDATE_SUPPORT_SETTINGS',
          details: JSON.stringify(settings),
        },
      });
    }

    return this.getSupportContactSettings();
  }


  /**
   * Fetch all users with key stats for admin table
   */
  async getUsersList(search?: string, statusFilter?: string) {
    const whereClause: any = {};

    if (statusFilter && statusFilter !== 'ALL') {
      whereClause.status = statusFilter;
    }

    if (search && search.trim()) {
      const q = search.trim();
      whereClause.OR = [
        { username: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
        { id: { contains: q } },
      ];
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      include: {
        wallet: true,
        deposits: {
          where: { status: 'APPROVED' },
          select: { baseAmount: true },
        },
        withdrawals: {
          where: { status: 'COMPLETED' },
          select: { amount: true },
        },
        _count: {
          select: {
            deposits: true,
            withdrawals: true,
            roomPlayers: true,
            roomsWon: true,
            feedbacks: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return users.map((u) => {
      const totalDepositedAmount = u.deposits.reduce((acc, d) => acc + d.baseAmount, 0);
      const totalWithdrawnAmount = u.withdrawals.reduce((acc, w) => acc + w.amount, 0);

      return {
        id: u.id,
        username: u.username,
        phone: u.phone,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt.toISOString(),
        balance: u.wallet?.balance || 0,
        lockedBalance: u.wallet?.lockedBalance || 0,
        totalDepositsCount: u._count.deposits,
        totalDepositedAmount,
        totalWithdrawalsCount: u._count.withdrawals,
        totalWithdrawnAmount,
        roomsPlayedCount: u._count.roomPlayers,
        roomsWonCount: u._count.roomsWon,
        feedbacksCount: u._count.feedbacks,
      };
    });
  }

  /**
   * Fetch comprehensive profile of a specific user with full history & stats
   */
  async getUserProfileDetail(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: true,
        deposits: {
          orderBy: { createdAt: 'desc' },
          take: 25,
        },
        withdrawals: {
          orderBy: { createdAt: 'desc' },
          take: 25,
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 35,
        },
        roomPlayers: {
          include: {
            room: true,
          },
          orderBy: { joinedAt: 'desc' },
          take: 25,
        },
        feedbacks: {
          orderBy: { createdAt: 'desc' },
          take: 25,
        },
        auditLogsTarget: {
          include: {
            actor: {
              select: { id: true, username: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const allDeposits = await prisma.deposit.findMany({
      where: { userId },
      select: { baseAmount: true, status: true },
    });
    const approvedDeposits = allDeposits.filter((d) => d.status === 'APPROVED');
    const approvedDepositsSum = approvedDeposits.reduce((acc, d) => acc + d.baseAmount, 0);

    const allWithdrawals = await prisma.withdrawal.findMany({
      where: { userId },
      select: { amount: true, status: true },
    });
    const completedWithdrawals = allWithdrawals.filter((w) => w.status === 'COMPLETED');
    const completedWithdrawalsSum = completedWithdrawals.reduce((acc, w) => acc + w.amount, 0);

    const roomsPlayed = await prisma.roomPlayer.count({ where: { userId } });
    const roomsWon = await prisma.room.count({ where: { winnerId: userId } });
    const winRate = roomsPlayed > 0 ? parseFloat(((roomsWon / roomsPlayed) * 100).toFixed(1)) : 0;

    const totalBalance = (user.wallet?.balance || 0) + (user.wallet?.lockedBalance || 0);
    // Net profit for user: (Completed payouts + total balance including locked funds) - Approved deposits
    const netProfitLoss = parseFloat((completedWithdrawalsSum + totalBalance - approvedDepositsSum).toFixed(2));

    return {
      id: user.id,
      username: user.username,
      phone: user.phone,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      wallet: user.wallet
        ? {
            balance: user.wallet.balance,
            lockedBalance: user.wallet.lockedBalance,
            updatedAt: user.wallet.updatedAt.toISOString(),
          }
        : null,
      metrics: {
        totalDepositsCount: allDeposits.length,
        approvedDepositsSum,
        totalWithdrawalsCount: allWithdrawals.length,
        completedWithdrawalsSum,
        roomsPlayed,
        roomsWon,
        winRate,
        netProfitLoss,
      },
      recentTransactions: user.transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        referenceId: t.referenceId,
        description: t.description,
        createdAt: t.createdAt.toISOString(),
      })),
      recentDeposits: user.deposits.map((d) => ({
        id: d.id,
        baseAmount: d.baseAmount,
        totalAmount: d.totalAmount,
        status: d.status,
        utr: d.utr,
        receivingUpi: d.receivingUpi,
        createdAt: d.createdAt.toISOString(),
      })),
      recentWithdrawals: user.withdrawals.map((w) => ({
        id: w.id,
        amount: w.amount,
        upiId: w.upiId,
        status: w.status,
        payoutUtr: w.payoutUtr,
        reason: w.reason,
        createdAt: w.createdAt.toISOString(),
      })),
      recentGames: user.roomPlayers.map((rp) => ({
        id: rp.id,
        roomId: rp.roomId,
        roomCode: rp.room.roomCode,
        entryFee: rp.room.entryFee,
        guessNumber: rp.guessNumber,
        winningNumber: rp.room.winningNumber,
        isWinner: rp.room.winnerId === user.id,
        status: rp.room.status,
        createdAt: rp.joinedAt.toISOString(),
      })),
      feedbacks: user.feedbacks.map((f) => ({
        id: f.id,
        userId: f.userId,
        category: f.category,
        subject: f.subject,
        message: f.message,
        contactInfo: f.contactInfo,
        status: f.status,
        adminReply: f.adminReply,
        repliedAt: f.repliedAt?.toISOString() || null,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      auditLogs: user.auditLogsTarget.map((log) => ({
        id: log.id,
        action: log.action,
        actor: {
          id: log.actor.id,
          username: log.actor.username,
        },
        details: log.details,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Update user status (ACTIVE, SUSPENDED, BANNED)
   */
  async updateUserStatus(userId: string, newStatus: string, adminId: string, reason?: string) {
    const validStatuses = ['ACTIVE', 'SUSPENDED', 'BANNED'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    return serializable(async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: adminId } });
      if (!actor || !['ADMIN', 'SUPER_ADMIN'].includes(actor.role)) {
        throw new Error('Unauthorized');
      }

      const existingUser = await tx.user.findUnique({ where: { id: userId } });
      if (!existingUser) throw new Error('User not found');

      // 1. Regular ADMIN cannot modify ADMIN or SUPER_ADMIN
      if (actor.role === 'ADMIN' && ['ADMIN', 'SUPER_ADMIN'].includes(existingUser.role)) {
        throw new Error('Administrators cannot modify status of other administrators or superadmins');
      }

      // 2. Prevent self-ban / self-suspension
      if (adminId === userId && newStatus !== 'ACTIVE') {
        throw new Error('Administrators cannot ban or deactivate their own account');
      }

      // 3. Prevent banning or deactivating the last active SUPER_ADMIN
      if (existingUser.role === 'SUPER_ADMIN' && newStatus !== 'ACTIVE') {
        const remainingSuperAdmins = await tx.user.count({
          where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: userId } },
        });
        if (remainingSuperAdmins === 0) {
          throw new Error('Cannot ban or deactivate the last active SUPER_ADMIN account');
        }
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { status: newStatus },
        select: { id: true, username: true, status: true, role: true },
      });

      // Revoke refresh tokens on ban/suspension
      if (newStatus !== 'ACTIVE') {
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          targetId: userId,
          action: 'UPDATE_USER_STATUS',
          details: JSON.stringify({
            prevStatus: existingUser.status,
            newStatus,
            reason: reason || 'Updated by admin',
          }),
        },
      });

      return updatedUser;
    });
  }

  /**
   * Admin balance adjustment
   */
  async adjustUserBalance(userId: string, amount: number, reason: string, adminId: string) {
    return walletService.adjustBalance(userId, amount, reason, adminId);
  }

  /**
   * Create user feedback / support ticket
   */
  async createFeedback(userId: string, category: string, subject: string, message: string, contactInfo?: string) {
    if (!subject?.trim() || !message?.trim()) {
      throw new Error('Subject and message are required');
    }

    const feedback = await prisma.feedback.create({
      data: {
        userId,
        category: category || 'GENERAL',
        subject: subject.trim(),
        message: message.trim(),
        contactInfo: contactInfo?.trim() || null,
        status: 'OPEN',
      },
      include: {
        user: { select: { id: true, username: true, email: true, phone: true } },
      },
    });

    return feedback;
  }

  /**
   * Delete a user by ID, username, or phone
   */
  async deleteUser(userIdOrIdentifier: string) {
    return serializable(async (tx) => {
      const user = await tx.user.findFirst({
        where: {
          OR: [
            { id: userIdOrIdentifier },
            { username: userIdOrIdentifier },
            { phone: userIdOrIdentifier },
          ],
        },
        include: {
          wallet: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.role === 'SUPER_ADMIN') {
        throw new Error('Cannot delete a SUPER_ADMIN account');
      }

      // Protect accounts with active balance
      if (user.wallet && (user.wallet.balance > 0 || user.wallet.lockedBalance > 0)) {
        throw new Error('Cannot delete account with an active or locked wallet balance. Please settle or refund funds first.');
      }

      const [txCount, depCount, withCount, activeRooms] = await Promise.all([
        tx.transaction.count({ where: { userId: user.id } }),
        tx.deposit.count({ where: { userId: user.id } }),
        tx.withdrawal.count({ where: { userId: user.id } }),
        tx.roomPlayer.count({
          where: {
            userId: user.id,
            room: { status: { in: ['WAITING', 'COUNTDOWN', 'PLAYING', 'ROLLING'] } },
          },
        }),
      ]);

      if (activeRooms > 0) {
        throw new Error('Cannot delete user currently participating in active game rooms.');
      }

      if (txCount > 0 || depCount > 0 || withCount > 0) {
        throw new Error('Cannot delete user with financial records. Please suspend or ban the account to preserve financial audit trail.');
      }

      await tx.user.delete({
        where: { id: user.id },
      });

      return { success: true, message: `User ${user.username} deleted successfully` };
    });
  }

  /**
   * Get user's own feedback tickets
   */
  async getUserFeedbacks(userId: string) {
    return prisma.feedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Fetch all feedback tickets for admin
   */
  async getAllFeedback(statusFilter?: string) {
    const where: any = {};
    if (statusFilter && statusFilter !== 'ALL') {
      where.status = statusFilter;
    }

    return prisma.feedback.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            status: true,
            wallet: { select: { balance: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Reply to feedback and optionally update status
   */
  async replyFeedback(feedbackId: string, adminReply: string, newStatus?: string, adminId?: string) {
    if (!adminReply?.trim()) {
      throw new Error('Reply message cannot be empty');
    }

    const updated = await prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        adminReply: adminReply.trim(),
        status: newStatus || 'RESOLVED',
        repliedAt: new Date(),
      },
      include: {
        user: { select: { id: true, username: true, email: true, phone: true } },
      },
    });

    if (adminId) {
      await prisma.auditLog.create({
        data: {
          actorId: adminId,
          targetId: updated.userId,
          action: 'REPLY_FEEDBACK',
          details: JSON.stringify({
            feedbackId,
            reply: adminReply.trim(),
            status: updated.status,
          }),
        },
      });
    }

    notificationService.create({
      userId: updated.userId,
      title: 'Support Ticket Reply',
      message: `Admin replied to your ticket "${updated.subject}": ${adminReply.trim()}`,
      type: 'FEEDBACK_REPLY',
      metadata: {
        feedbackId: updated.id,
        status: updated.status,
      },
    }).catch(err => console.error('Failed to create feedback reply notification:', err));

    return updated;
  }

  /**
   * Fetch all pending and recent deposits
   */
  async getDepositsList(statusFilter?: string, limit: number = 50, skip: number = 0) {
    if (statusFilter && statusFilter !== 'ALL') {
      return prisma.deposit.findMany({
        where: { status: statusFilter },
        include: {
          user: { select: { id: true, username: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 200),
        skip,
      });
    }

    if (skip === 0) {
      const pending = await prisma.deposit.findMany({
        where: { status: 'PENDING' },
        include: { user: { select: { id: true, username: true, phone: true } } },
        orderBy: { createdAt: 'asc' },
      });
      const remainingSlots = Math.max(0, limit - pending.length);
      const nonPending = remainingSlots > 0 ? await prisma.deposit.findMany({
        where: { status: { not: 'PENDING' } },
        include: { user: { select: { id: true, username: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: remainingSlots,
      }) : [];
      return [...pending, ...nonPending];
    }

    return prisma.deposit.findMany({
      include: {
        user: { select: { id: true, username: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      skip,
    });
  }

  /**
   * Fetch all withdrawals
   */
  async getWithdrawalsList(statusFilter?: string, limit: number = 50, skip: number = 0) {
    if (statusFilter && statusFilter !== 'ALL') {
      return prisma.withdrawal.findMany({
        where: { status: statusFilter },
        include: {
          user: { select: { id: true, username: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 200),
        skip,
      });
    }

    if (skip === 0) {
      const pending = await prisma.withdrawal.findMany({
        where: { status: 'PENDING' },
        include: { user: { select: { id: true, username: true, phone: true } } },
        orderBy: { createdAt: 'asc' },
      });
      const remainingSlots = Math.max(0, limit - pending.length);
      const nonPending = remainingSlots > 0 ? await prisma.withdrawal.findMany({
        where: { status: { not: 'PENDING' } },
        include: { user: { select: { id: true, username: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: remainingSlots,
      }) : [];
      return [...pending, ...nonPending];
    }

    return prisma.withdrawal.findMany({
      include: {
        user: { select: { id: true, username: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      skip,
    });
  }

  /**
   * Manually approve a deposit with verified bank UTR
   */
  async approveDeposit(depositId: string, utr: string, adminId: string) {
    return paymentService.adminApproveDeposit(depositId, utr, adminId);
  }

  /**
   * Reject a deposit claim
   */
  async rejectDeposit(depositId: string, reason: string, adminId: string) {
    return paymentService.adminRejectDeposit(depositId, reason, adminId);
  }

  /**
   * Fetch all unmatched/orphan payments
   */
  async getUnmatchedPayments(statusFilter?: string) {
    return paymentService.getUnmatchedPayments(statusFilter);
  }

  /**
   * Assign an unmatched bank payment to a player's wallet
   */
  async assignUnmatchedPayment(unmatchedId: string, userId: string, adminId: string) {
    return paymentService.assignUnmatchedPayment(unmatchedId, userId, adminId);
  }

  /**
   * Complete withdrawal
   */
  async completeWithdrawal(withdrawalId: string, payoutUtr: string) {
    return walletService.completeWithdrawal(withdrawalId, payoutUtr);
  }

  /**
   * Reject withdrawal
   */
  async rejectWithdrawal(withdrawalId: string, reason?: string) {
    return walletService.rejectWithdrawal(withdrawalId, reason);
  }

  /**
   * Audit platform solvency and double-entry ledger balance integrity
   */
  async auditPlatformSolvency() {
    const wallets = await prisma.wallet.findMany({ select: { balance: true, lockedBalance: true } });
    const totalUserAvailablePaise = wallets.reduce((sum, w) => sum + toPaise(w.balance), 0);
    const totalUserLockedPaise = wallets.reduce((sum, w) => sum + toPaise(w.lockedBalance), 0);
    const totalUserLiabilityPaise = totalUserAvailablePaise + totalUserLockedPaise;

    const [deposits, assignedUnmatched, withdrawals, manualAdjustments] = await Promise.all([
      prisma.deposit.aggregate({
        where: { status: 'APPROVED' },
        _sum: { baseAmount: true },
      }),
      prisma.unmatchedPayment.aggregate({
        where: { status: 'ASSIGNED' },
        _sum: { amount: true },
      }),
      prisma.withdrawal.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { type: { in: ['MANUAL_ADJUST', 'MANUAL_CREDIT', 'MANUAL_DEBIT'] } },
        _sum: { amount: true },
      }),
    ]);

    const totalApprovedDepositsPaise = toPaise(deposits._sum.baseAmount || 0) + toPaise(assignedUnmatched._sum.amount || 0);
    const totalCompletedWithdrawalsPaise = toPaise(withdrawals._sum.amount || 0);
    const totalManualAdjustPaise = toPaise(manualAdjustments._sum.amount || 0);

    const completedRooms = await prisma.room.findMany({
      where: { status: 'COMPLETED' },
      select: {
        entryFee: true,
        maxPlayers: true,
        winnerPrize: true,
        customConfig: true,
        players: { select: { id: true } },
      },
    });
    const totalPlatformCommissionPaise = completedRooms.reduce((sum, r) => {
      let configObj: Record<string, any> = {};
      try {
        if (r.customConfig) configObj = JSON.parse(r.customConfig);
      } catch (_) {}

      if (typeof configObj.platformCommission === 'number') {
        return sum + toPaise(configObj.platformCommission);
      }
      if (typeof configObj.settlement?.commissionAmount === 'number') {
        return sum + toPaise(configObj.settlement.commissionAmount);
      }
      if (typeof configObj.settledPool === 'number' && r.winnerPrize != null) {
        return sum + Math.max(0, toPaise(configObj.settledPool) - toPaise(r.winnerPrize));
      }
      if (typeof configObj.settlement?.totalPot === 'number' && r.winnerPrize != null) {
        return sum + Math.max(0, toPaise(configObj.settlement.totalPot) - toPaise(r.winnerPrize));
      }

      const participantsCount = Array.isArray(r.players) && r.players.length > 0
        ? r.players.length
        : configObj.predictions && typeof configObj.predictions === 'object'
          ? Object.keys(configObj.predictions).length
          : 0;

      if (configObj.playerStakes && r.winnerPrize != null) {
        const inGameStakes = Object.values(configObj.playerStakes as Record<string, number>).reduce(
          (a, b) => a + (typeof b === 'number' ? toPaise(b) : 0),
          0
        );
        const pool = toPaise(r.entryFee) * participantsCount + inGameStakes;
        const prize = toPaise(r.winnerPrize);
        return sum + Math.max(0, pool - prize);
      }
      const pool = toPaise(r.entryFee) * participantsCount;
      const prize = toPaise(r.winnerPrize || 0);
      return sum + Math.max(0, pool - prize);
    }, 0);

    const netSystemFundsPaise = totalApprovedDepositsPaise - totalCompletedWithdrawalsPaise;
    const expectedLiabilityPaise = netSystemFundsPaise - totalPlatformCommissionPaise + totalManualAdjustPaise;
    const variancePaise = totalUserLiabilityPaise - expectedLiabilityPaise;

    return {
      isSolvent: Math.abs(variancePaise) < 100, // tolerance < ₹1 due to rounding
      totalUserAvailable: totalUserAvailablePaise / 100,
      totalUserLocked: totalUserLockedPaise / 100,
      totalUserLiability: totalUserLiabilityPaise / 100,
      totalApprovedDeposits: totalApprovedDepositsPaise / 100,
      totalCompletedWithdrawals: totalCompletedWithdrawalsPaise / 100,
      totalPlatformCommission: totalPlatformCommissionPaise / 100,
      varianceRupees: variancePaise / 100,
      auditedAt: new Date().toISOString(),
    };
  }
}

export const adminService = new AdminService();

