import { prisma } from '../../db';
import { walletService } from '../wallet/wallet.service';
import { paymentService } from '../payment/payment.service';

export class AdminService {
  /**
   * Get admin dashboard overview stats
   */
  async getDashboardStats() {
    const totalUsers = await prisma.user.count();
    const deposits = await prisma.deposit.findMany();
    const withdrawals = await prisma.withdrawal.findMany();
    const rooms = await prisma.room.findMany();

    const completedDeposits = deposits.filter((d) => d.status === 'APPROVED');
    const pendingDeposits = deposits.filter((d) => d.status === 'PENDING');
    const totalDepositVolume = completedDeposits.reduce((acc, d) => acc + d.baseAmount, 0);

    const pendingWithdrawals = withdrawals.filter((w) => w.status === 'PENDING');
    const completedWithdrawals = withdrawals.filter((w) => w.status === 'COMPLETED');
    const totalPayoutVolume = completedWithdrawals.reduce((acc, w) => acc + w.amount, 0);

    const activeRooms = rooms.filter((r) => r.status === 'WAITING' || r.status === 'PLAYING');
    const completedRooms = rooms.filter((r) => r.status === 'COMPLETED');

    const adminUpi = await prisma.systemSetting.findUnique({
      where: { key: 'admin_upi_id' },
    });
    const adminName = await prisma.systemSetting.findUnique({
      where: { key: 'admin_upi_name' },
    });
    const commissionSetting = await prisma.systemSetting.findUnique({
      where: { key: 'platform_commission' },
    });
    const commissionPercent = parseFloat(commissionSetting?.value || '0');
    const totalRoomVolume = completedRooms.reduce((acc, r) => acc + r.entryFee * r.maxPlayers, 0);
    const platformProfit = (totalRoomVolume * commissionPercent) / 100;

    const openFeedbacksCount = await prisma.feedback.count({
      where: { status: 'OPEN' },
    });

    const supportEmail = await prisma.systemSetting.findUnique({ where: { key: 'support_email' } });
    const supportWhatsapp = await prisma.systemSetting.findUnique({ where: { key: 'support_whatsapp' } });
    const supportTelegram = await prisma.systemSetting.findUnique({ where: { key: 'support_telegram' } });
    const supportHours = await prisma.systemSetting.findUnique({ where: { key: 'support_hours' } });

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
      commissionPercent: commissionSetting?.value || '0',
      supportEmail: supportEmail?.value || 'support@moneygame.com',
      supportWhatsapp: supportWhatsapp?.value || '+91 98765 43210',
      supportTelegram: supportTelegram?.value || '@MoneyGameSupport',
      supportHours: supportHours?.value || '24/7 Live Support',
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

    const currentBalance = user.wallet?.balance || 0;
    // Net profit for user: (Completed payouts + current balance) - Approved deposits
    const netProfitLoss = parseFloat((completedWithdrawalsSum + currentBalance - approvedDepositsSum).toFixed(2));

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

    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) throw new Error('User not found');

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { status: newStatus },
      select: { id: true, username: true, status: true, role: true },
    });

    await prisma.auditLog.create({
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

    return updated;
  }

  /**
   * Fetch all pending and recent deposits
   */
  async getDepositsList() {
    return prisma.deposit.findMany({
      include: {
        user: { select: { id: true, username: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Fetch all withdrawals
   */
  async getWithdrawalsList() {
    return prisma.withdrawal.findMany({
      include: {
        user: { select: { id: true, username: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * 1-Click Simulator: Simulates the Android listener receiving a bank push notification
   */
  async simulateIncomingWebhook(amount: number, utr?: string) {
    const generatedUtr = utr || `SIM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    return paymentService.verifyIncomingPayment(amount, generatedUtr);
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
}

export const adminService = new AdminService();

