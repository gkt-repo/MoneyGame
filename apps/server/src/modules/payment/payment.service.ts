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
   */
  async createDepositRequest(userId: string, baseAmount: number) {
    if (baseAmount < 1) {
      throw new Error('Minimum deposit amount is ₹1.00');
    }

    // Clean up expired pending deposits first
    await this.expireOldDeposits();

    const now = new Date();

    // 1. Find all active pending deposits for this base amount to prevent paise collision
    const activeDeposits = await prisma.deposit.findMany({
      where: {
        baseAmount,
        status: 'PENDING',
        expiresAt: { gt: now },
      },
      select: { offsetPaise: true },
    });

    const usedOffsets = new Set(activeDeposits.map((d) => d.offsetPaise));

    // 2. Pick an unused offset between 1 and 99 paise
    let selectedOffset: number | null = null;
    // Generate randomized order of 1..99 to avoid always assigning .01 first
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

    // 3. Get active receiving UPI ID from DB or config
    const upiSetting = await prisma.systemSetting.findUnique({
      where: { key: 'admin_upi_id' },
    });
    const nameSetting = await prisma.systemSetting.findUnique({
      where: { key: 'admin_upi_name' },
    });

    const receivingUpi = upiSetting?.value || config.adminUpiId;
    const receivingName = nameSetting?.value || config.adminUpiName;

    // 4. Create deposit record
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

    // 5. Generate UPI URI & QR Code
    // Format: upi://pay?pa=...&pn=...&am=100.14&cu=INR&tn=Deposit...
    // Note: Keep literal '@' in receivingUpi as standard UPI apps require it without percent-encoding
    const upiUri = `upi://pay?pa=${receivingUpi.trim()}&pn=${encodeURIComponent(
      receivingName.trim()
    )}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Deposit #${deposit.id.slice(0, 8)}`)}`;

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
   */
  async verifyIncomingPayment(amount: number, utr?: string) {
    const roundedAmount = parseFloat(amount.toFixed(2));
    const now = new Date();

    // 1. Prevent UTR replay attacks if UTR is provided
    if (utr) {
      const existingUtr = await prisma.deposit.findUnique({
        where: { utr },
      });
      if (existingUtr) {
        return {
          success: false,
          message: `Payment with UTR ${utr} has already been processed previously.`,
        };
      }
    }

    // 2. Find matching pending deposit
    const deposit = await prisma.deposit.findFirst({
      where: {
        totalAmount: roundedAmount,
        status: 'PENDING',
        expiresAt: { gt: now },
      },
      include: { user: true },
    });

    if (!deposit) {
      return {
        success: false,
        message: `No active pending deposit expecting exact amount ₹${roundedAmount.toFixed(2)}.`,
      };
    }

    // 3. Mark deposit approved & atomically credit user wallet
    const updatedDeposit = await prisma.deposit.update({
      where: { id: deposit.id },
      data: {
        status: 'APPROVED',
        utr: utr || `AUTO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      },
    });

    const updatedWallet = await walletService.creditDeposit(
      deposit.userId,
      deposit.baseAmount,
      updatedDeposit.utr || undefined,
      deposit.id
    );

    if (this.io) {
      this.io.to(`user:${deposit.userId}`).emit('deposit_approved', {
        balance: updatedWallet.balance,
        depositId: deposit.id,
      });
      this.io.to(`user:${deposit.userId}`).emit('balance_updated', {
        balance: updatedWallet.balance,
      });
      this.io.emit('admin_new_deposit', {
        depositId: deposit.id,
        amount: deposit.totalAmount,
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
      return { status: 'EXPIRED', deposit };
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
