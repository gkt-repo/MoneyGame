import QRCode from 'qrcode';
import { prisma } from '../../db';
import { config } from '../../config';
import { walletService } from '../wallet/wallet.service';

export class PaymentService {
  private io: any = null;

  setSocketServer(io: any) {
    this.io = io;
  }

  /**
   * Method 3: Generates a dynamic amount with unique fractional paise offset
   * e.g., ₹100.14 valid for 10 minutes.
   * Auto-cancels any previous active pending deposits for this user to free up their previous paise offset.
   */
  async createDepositRequest(userId: string, baseAmount: number) {
    if (baseAmount < 1) {
      throw new Error('Minimum deposit amount is ₹1.00');
    }

    // 1. Clean up expired deposits across the system
    await this.expireOldDeposits();

    const now = new Date();

    // 2. Auto-expire any previous un-submitted PENDING deposit for this specific user
    // This frees up their previous paise offset immediately while preserving any CLAIMED deposits under review!
    await prisma.deposit.updateMany({
      where: {
        userId,
        status: 'PENDING',
      },
      data: { status: 'EXPIRED' },
    });

    // 3. Find all currently active pending deposits for this base amount to prevent paise collision
    const activeDeposits = await prisma.deposit.findMany({
      where: {
        baseAmount,
        status: { in: ['PENDING', 'CLAIMED'] },
        expiresAt: { gt: now },
      },
      select: { offsetPaise: true },
    });

    const usedOffsets = new Set(activeDeposits.map((d) => d.offsetPaise));

    // 4. Pick an unused offset between 1 and 99 paise
    let selectedOffset: number | null = null;
    const candidates = Array.from({ length: 99 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);

    for (const offset of candidates) {
      if (!usedOffsets.has(offset)) {
        selectedOffset = offset;
        break;
      }
    }

    if (selectedOffset === null) {
      throw new Error('All dynamic payment slots for this amount are currently in use. Please try again in 2 minutes.');
    }

    const totalAmount = parseFloat((baseAmount + selectedOffset / 100).toFixed(2));
    const expiresAt = new Date(now.getTime() + config.depositExpiryMinutes * 60 * 1000);

    // 5. Get active receiving UPI ID from DB or config
    const upiSetting = await prisma.systemSetting.findUnique({
      where: { key: 'admin_upi_id' },
    });
    const nameSetting = await prisma.systemSetting.findUnique({
      where: { key: 'admin_upi_name' },
    });

    const receivingUpi = upiSetting?.value || config.adminUpiId;
    const receivingName = nameSetting?.value || config.adminUpiName;

    // 6. Create deposit record
    const deposit = await prisma.deposit.create({
      data: {
        userId,
        baseAmount,
        offsetPaise: selectedOffset,
        totalAmount,
        receivingUpi,
        status: 'PENDING',
        expiresAt,
      },
    });

    // 7. Generate UPI URI & QR Code
    const upiUri = `upi://pay?pa=${receivingUpi.trim()}&pn=${encodeURIComponent(
      receivingName.trim()
    )}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Deposit ${deposit.id.slice(0, 8)}`)}`;

    const qrCodeDataUrl = await QRCode.toDataURL(upiUri, {
      margin: 2,
      width: 280,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    return {
      depositId: deposit.id,
      baseAmount,
      offsetPaise: selectedOffset,
      totalAmount,
      receivingUpi,
      receivingName,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
      upiUri,
      upiDeepLink: upiUri,
      qrCodeDataUrl,
      qrCodeUrl: qrCodeDataUrl,
    };
  }

  /**
   * Automated Webhook Receiver: Triggered by Android Notification Listener or Bank Email Forwarder
   * Matches exact amount received (e.g. ₹100.14) to the active pending deposit.
   * If not matched, saves to UnmatchedPayment ledger rather than dropping the transaction!
   */
  async verifyIncomingPayment(
    amount: number,
    utr?: string,
    senderInfo?: { senderUpi?: string; senderName?: string; rawPayload?: any }
  ) {
    const roundedAmount = parseFloat(amount.toFixed(2));
    const now = new Date();

    // 1. Prevent UTR replay attacks if UTR is provided
    if (utr) {
      const existingApproved = await prisma.deposit.findFirst({
        where: { utr, status: 'APPROVED' },
      });
      if (existingApproved) {
        return {
          success: false,
          message: `Payment with UTR ${utr} has already been approved and credited.`,
        };
      }
    }

    // 2. Find matching pending or claimed deposit
    // First, look for matching totalAmount among active deposits
    let deposit = await prisma.deposit.findFirst({
      where: {
        totalAmount: roundedAmount,
        status: { in: ['PENDING', 'CLAIMED'] },
        expiresAt: { gt: now },
      },
      include: { user: true },
    });

    // Second, if no active exact amount match, check if a player explicitly claimed this UTR
    // Note: includes 'EXPIRED' so user funds are credited even if bank notification took longer than 10 mins!
    if (!deposit && utr) {
      deposit = await prisma.deposit.findFirst({
        where: {
          userClaimedUtr: utr,
          status: { in: ['PENDING', 'CLAIMED', 'EXPIRED'] },
        },
        include: { user: true },
      });
    }

    // 3. If no matching deposit found: SAVE TO UNMATCHED PAYMENTS LEDGER (Never discard money!)
    if (!deposit) {
      const unmatched = await prisma.unmatchedPayment.create({
        data: {
          amount: roundedAmount,
          utr: utr || null,
          senderUpi: senderInfo?.senderUpi || null,
          senderName: senderInfo?.senderName || null,
          rawPayload: senderInfo?.rawPayload ? JSON.stringify(senderInfo.rawPayload) : null,
          status: 'UNCLAIMED',
        },
      });

      if (this.io) {
        this.io.emit('admin_unmatched_payment', unmatched);
      }

      return {
        success: false,
        unmatched: true,
        message: `No active pending deposit expecting ₹${roundedAmount.toFixed(2)}. Saved to Unmatched Payments ledger for admin review.`,
        unmatchedPaymentId: unmatched.id,
      };
    }

    // 4. Mark deposit approved & atomically credit user wallet
    const updatedDeposit = await prisma.deposit.update({
      where: { id: deposit.id },
      data: {
        status: 'APPROVED',
        utr: utr || `AUTO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        claimStatus: 'AUTO_MATCHED',
        approvedAt: new Date(),
      },
    });

    const updatedWallet = await walletService.creditDeposit(
      deposit.userId,
      deposit.baseAmount,
      updatedDeposit.utr || undefined,
      deposit.id
    );

    // If an unmatched record with this UTR existed previously, mark it resolved
    if (utr) {
      await prisma.unmatchedPayment.updateMany({
        where: { utr, status: 'UNCLAIMED' },
        data: {
          status: 'ASSIGNED',
          assignedDepositId: deposit.id,
          assignedUserId: deposit.userId,
          resolvedAt: new Date(),
        },
      });
    }

    // 5. Broadcast instant real-time events to user channels
    if (this.io) {
      // Direct user channel
      this.io.to(`user:${deposit.userId}`).emit('deposit_approved', {
        depositId: deposit.id,
        amount: deposit.baseAmount,
        totalAmount: deposit.totalAmount,
        utr: updatedDeposit.utr,
        balance: updatedWallet.balance,
      });

      // Direct deposit room channel (for AddCash screen listening directly)
      this.io.to(`deposit:${deposit.id}`).emit('deposit_approved', {
        depositId: deposit.id,
        amount: deposit.baseAmount,
        totalAmount: deposit.totalAmount,
        utr: updatedDeposit.utr,
        balance: updatedWallet.balance,
      });

      this.io.to(`user:${deposit.userId}`).emit('balance_updated', {
        balance: updatedWallet.balance,
        lockedBalance: updatedWallet.lockedBalance,
      });

      this.io.emit('admin_new_deposit', {
        depositId: deposit.id,
        amount: deposit.totalAmount,
        userId: deposit.userId,
        utr: updatedDeposit.utr,
      });
    }

    return {
      success: true,
      message: `Successfully verified and credited ₹${deposit.baseAmount.toFixed(2)} to ${deposit.user.username}`,
      deposit: updatedDeposit,
      wallet: updatedWallet,
      userId: deposit.userId,
    };
  }

  /**
   * User Fallback: Player clicks "I Have Paid" and submits their 12-digit bank UTR
   * Instantly checks if the bank notification was already received in the Unmatched ledger.
   * If yes -> Instant approval! If not -> Flags deposit as CLAIMED for priority admin match.
   */
  async claimDepositUtr(userId: string, depositId: string, utr: string) {
    const cleanUtr = utr.trim();
    if (!cleanUtr || cleanUtr.length < 8) {
      throw new Error('Please enter a valid 12-digit UPI Reference Number / UTR');
    }

    const deposit = await prisma.deposit.findUnique({
      where: { id: depositId },
      include: { user: true },
    });

    if (!deposit) throw new Error('Deposit request not found');
    if (deposit.userId !== userId) throw new Error('Unauthorized deposit claim');
    if (deposit.status === 'APPROVED') {
      return {
        success: true,
        alreadyApproved: true,
        message: 'This deposit has already been verified and credited!',
        deposit,
      };
    }

    // Prevent duplicate/replay claim of already approved UTR
    const duplicateApproved = await prisma.deposit.findFirst({
      where: { utr: cleanUtr, status: 'APPROVED' },
    });
    if (duplicateApproved) {
      throw new Error(`This bank UTR (${cleanUtr}) has already been verified and credited for another deposit.`);
    }

    // 1. Check if an incoming bank notification with this UTR is already in the Unmatched ledger!
    const unmatched = await prisma.unmatchedPayment.findFirst({
      where: { utr: cleanUtr, status: 'UNCLAIMED' },
    });

    if (unmatched) {
      // Instant Reconciliation!
      const updatedDeposit = await prisma.deposit.update({
        where: { id: deposit.id },
        data: {
          status: 'APPROVED',
          utr: cleanUtr,
          userClaimedUtr: cleanUtr,
          claimStatus: 'AUTO_MATCHED',
          approvedAt: new Date(),
        },
      });

      const updatedWallet = await walletService.creditDeposit(
        userId,
        deposit.baseAmount,
        cleanUtr,
        deposit.id
      );

      await prisma.unmatchedPayment.update({
        where: { id: unmatched.id },
        data: {
          status: 'ASSIGNED',
          assignedDepositId: deposit.id,
          assignedUserId: userId,
          resolvedAt: new Date(),
        },
      });

      if (this.io) {
        this.io.to(`user:${userId}`).emit('deposit_approved', {
          depositId: deposit.id,
          amount: deposit.baseAmount,
          utr: cleanUtr,
          balance: updatedWallet.balance,
        });
        this.io.to(`deposit:${deposit.id}`).emit('deposit_approved', {
          depositId: deposit.id,
          amount: deposit.baseAmount,
          utr: cleanUtr,
          balance: updatedWallet.balance,
        });
        this.io.to(`user:${userId}`).emit('balance_updated', {
          balance: updatedWallet.balance,
        });
      }

      return {
        success: true,
        instantApproval: true,
        message: `Payment verified instantly via bank record (UTR: ${cleanUtr})! ₹${deposit.baseAmount.toFixed(2)} added to your wallet.`,
        deposit: updatedDeposit,
        wallet: updatedWallet,
      };
    }

    // 2. Notification hasn't arrived yet from bank/listener: Mark as CLAIMED
    const claimedDeposit = await prisma.deposit.update({
      where: { id: deposit.id },
      data: {
        status: 'CLAIMED',
        userClaimedUtr: cleanUtr,
        claimStatus: 'CLAIMED_BY_USER',
      },
    });

    if (this.io) {
      this.io.emit('admin_deposit_claimed', {
        depositId: deposit.id,
        userId,
        username: deposit.user.username,
        amount: deposit.totalAmount,
        userClaimedUtr: cleanUtr,
      });
    }

    return {
      success: true,
      instantApproval: false,
      message: `UTR ${cleanUtr} recorded! System is actively monitoring bank updates. Your balance will credit as soon as the bank clears the transfer.`,
      deposit: claimedDeposit,
    };
  }

  /**
   * Admin Manual Approval of a pending/claimed deposit
   */
  async adminApproveDeposit(depositId: string, utr: string, adminId: string) {
    const cleanUtr = utr.trim();
    if (!cleanUtr) throw new Error('Valid bank UTR is required for manual approval');

    const deposit = await prisma.deposit.findUnique({
      where: { id: depositId },
      include: { user: true },
    });

    if (!deposit) throw new Error('Deposit request not found');
    if (deposit.status === 'APPROVED') throw new Error('Deposit is already approved');

    const duplicateUtr = await prisma.deposit.findFirst({
      where: { utr: cleanUtr, status: 'APPROVED' },
    });
    if (duplicateUtr && duplicateUtr.id !== depositId) {
      throw new Error(`Bank UTR ${cleanUtr} has already been recorded for another deposit (#${duplicateUtr.id.slice(0, 8)})`);
    }

    const updatedDeposit = await prisma.deposit.update({
      where: { id: depositId },
      data: {
        status: 'APPROVED',
        utr: cleanUtr,
        claimStatus: 'MANUALLY_VERIFIED',
        approvedAt: new Date(),
      },
    });

    // Auto-resolve any unmatched record if this UTR was recorded in unmatched ledger
    await prisma.unmatchedPayment.updateMany({
      where: { utr: cleanUtr, status: 'UNCLAIMED' },
      data: {
        status: 'ASSIGNED',
        assignedDepositId: deposit.id,
        assignedUserId: deposit.userId,
        resolvedAt: new Date(),
      },
    });

    const updatedWallet = await walletService.creditDeposit(
      deposit.userId,
      deposit.baseAmount,
      cleanUtr,
      deposit.id
    );

    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        targetId: deposit.userId,
        action: 'MANUAL_DEPOSIT_APPROVE',
        details: JSON.stringify({
          depositId,
          amount: deposit.baseAmount,
          utr: cleanUtr,
        }),
      },
    });

    if (this.io) {
      this.io.to(`user:${deposit.userId}`).emit('deposit_approved', {
        depositId: deposit.id,
        amount: deposit.baseAmount,
        utr: cleanUtr,
        balance: updatedWallet.balance,
      });
      this.io.to(`deposit:${deposit.id}`).emit('deposit_approved', {
        depositId: deposit.id,
        amount: deposit.baseAmount,
        utr: cleanUtr,
        balance: updatedWallet.balance,
      });
      this.io.to(`user:${deposit.userId}`).emit('balance_updated', {
        balance: updatedWallet.balance,
      });
    }

    return {
      success: true,
      message: `Deposit of ₹${deposit.baseAmount.toFixed(2)} manually approved for ${deposit.user.username}`,
      deposit: updatedDeposit,
      wallet: updatedWallet,
    };
  }

  /**
   * Admin Rejection of an invalid/expired deposit claim
   */
  async adminRejectDeposit(depositId: string, reason: string, adminId: string) {
    const deposit = await prisma.deposit.findUnique({
      where: { id: depositId },
      include: { user: true },
    });

    if (!deposit) throw new Error('Deposit request not found');
    if (deposit.status === 'APPROVED') throw new Error('Cannot reject an already approved deposit');

    const updatedDeposit = await prisma.deposit.update({
      where: { id: depositId },
      data: {
        status: 'REJECTED',
        claimStatus: 'REJECTED_BY_ADMIN',
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        targetId: deposit.userId,
        action: 'REJECT_DEPOSIT_CLAIM',
        details: JSON.stringify({ depositId, reason }),
      },
    });

    return {
      success: true,
      message: `Deposit claim #${deposit.id.slice(0, 8)} rejected`,
      deposit: updatedDeposit,
    };
  }

  /**
   * Admin: Assign orphan unmatched payment directly to a user
   */
  async assignUnmatchedPayment(unmatchedId: string, userId: string, adminId: string) {
    const unmatched = await prisma.unmatchedPayment.findUnique({
      where: { id: unmatchedId },
    });

    if (!unmatched) throw new Error('Unmatched payment record not found');
    if (unmatched.status === 'ASSIGNED') throw new Error('Payment already assigned');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Target user not found');

    const updatedWallet = await walletService.creditDeposit(
      userId,
      unmatched.amount,
      unmatched.utr || undefined,
      `UNMATCHED-${unmatched.id}`
    );

    const updatedUnmatched = await prisma.unmatchedPayment.update({
      where: { id: unmatchedId },
      data: {
        status: 'ASSIGNED',
        assignedUserId: userId,
        resolvedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        targetId: userId,
        action: 'ASSIGN_UNMATCHED_PAYMENT',
        details: JSON.stringify({
          unmatchedId,
          amount: unmatched.amount,
          utr: unmatched.utr,
        }),
      },
    });

    if (this.io) {
      this.io.to(`user:${userId}`).emit('deposit_approved', {
        amount: unmatched.amount,
        utr: unmatched.utr,
        balance: updatedWallet.balance,
      });
      this.io.to(`user:${userId}`).emit('balance_updated', {
        balance: updatedWallet.balance,
      });
    }

    return {
      success: true,
      message: `Assigned ₹${unmatched.amount.toFixed(2)} to ${user.username}`,
      unmatched: updatedUnmatched,
      wallet: updatedWallet,
    };
  }

  /**
   * Get unmatched payments list for admin
   */
  async getUnmatchedPayments(statusFilter = 'UNCLAIMED') {
    const where: any = {};
    if (statusFilter !== 'ALL') {
      where.status = statusFilter;
    }

    return prisma.unmatchedPayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Fetch all deposits made by a specific user (User Passbook / Deposit History)
   */
  async getUserDeposits(userId: string) {
    return prisma.deposit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Poll deposit status (used by frontend while waiting for payment)
   */
  async getDepositStatus(depositId: string) {
    const deposit = await prisma.deposit.findUnique({
      where: { id: depositId },
    });

    if (!deposit) throw new Error('Deposit request not found');

    const now = new Date();
    if (deposit.status === 'PENDING' && deposit.expiresAt < now) {
      await prisma.deposit.update({
        where: { id: depositId },
        data: { status: 'EXPIRED' },
      });
      return { status: 'EXPIRED', deposit: { ...deposit, status: 'EXPIRED' } };
    }

    return { status: deposit.status, deposit };
  }

  /**
   * Background cleanup
   */
  async expireOldDeposits() {
    const now = new Date();
    await prisma.deposit.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });
  }
}

export const paymentService = new PaymentService();
