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

    return {
      totalUsers,
      totalDepositVolume,
      totalPayoutVolume,
      completedDepositsCount: completedDeposits.length,
      pendingDepositsCount: pendingDeposits.length,
      pendingWithdrawalsCount: pendingWithdrawals.length,
      completedRoomsCount: completedRooms.length,
      adminUpiId: adminUpi?.value || 'admin@okhdfcbank',
      adminUpiName: adminName?.value || 'MoneyGame Admin',
      commissionPercent: commissionSetting?.value || '10',
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
   * Fetch all pending and recent deposits
   */
  async getDepositsList() {
    return prisma.deposit.findMany({
      include: {
        user: { select: { id: true, username: true } },
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
        user: { select: { id: true, username: true } },
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
