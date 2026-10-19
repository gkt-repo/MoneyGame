import crypto from 'crypto';
import { moveWallet } from '../../wallet-ledger';
import QRCode from 'qrcode';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { config } from '../../config';
import { serializable } from '../../transaction';
import { bankReference, money, toPaise } from '../../money';

const approvable = ['PENDING', 'CLAIMED', 'EXPIRED'];

export class PaymentService {
  private io: any = null;
  setSocketServer(io: any) { this.io = io; }

  private async expire(tx: Prisma.TransactionClient, now = new Date()) {
    await tx.deposit.updateMany({
      where: { expiresAt: { lte: now }, activeAmountKey: { not: null } },
      data: { activeAmountKey: null },
    });
    await tx.deposit.updateMany({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      data: { status: 'EXPIRED', activeAmountKey: null },
    });
  }

  async createDepositRequest(userId: string, amount: number) {
    const baseAmount = money(amount, 1);
    const deposit = await serializable(async tx => {
      await this.expire(tx);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.status !== 'ACTIVE') throw new Error('Active user account required');
      await tx.deposit.updateMany({
        where: { userId, status: 'PENDING' },
        data: { status: 'EXPIRED', activeAmountKey: null },
      });
      const candidates = Array.from({ length: 99 }, (_, i) => i + 1);
      const start = crypto.randomInt(99);
      const active = await tx.deposit.findMany({
        where: { status: { in: ['PENDING', 'CLAIMED'] }, expiresAt: { gt: new Date() } },
        select: { totalAmount: true },
      });
      // Compare actual amounts, including deposits with a fractional base amount.
      const used = new Set(active.map(d => toPaise(d.totalAmount)));
      const offsetPaise = candidates.map((_, i) => candidates[(start + i) % 99])
        .find(offset => !used.has(toPaise(baseAmount) + offset));
      if (offsetPaise === undefined) throw new Error('All payment slots for this amount are in use. Please try later.');
      const receivingUpi = (await tx.systemSetting.findUnique({ where: { key: 'admin_upi_id' } }))?.value || config.adminUpiId;
      return tx.deposit.create({ data: {
        userId, baseAmount, offsetPaise,
        totalAmount: (toPaise(baseAmount) + offsetPaise) / 100,
        activeAmountKey: toPaise(baseAmount) + offsetPaise,
        receivingUpi, expiresAt: new Date(Date.now() + config.depositExpiryMinutes * 60000),
      } });
    });
    const receivingName = (await prisma.systemSetting.findUnique({ where: { key: 'admin_upi_name' } }))?.value || config.adminUpiName;
    const upiUri = `upi://pay?pa=${encodeURIComponent(deposit.receivingUpi.trim())}&pn=${encodeURIComponent(receivingName.trim())}&am=${deposit.totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Order ${deposit.id.slice(0, 8)}`)}`;
    const qrCodeDataUrl = await QRCode.toDataURL(upiUri, { margin: 2, width: 280 });
    return {
      depositId: deposit.id, baseAmount, offsetPaise: deposit.offsetPaise,
      totalAmount: deposit.totalAmount, receivingUpi: deposit.receivingUpi, receivingName,
      expiresAt: deposit.expiresAt.toISOString(),
      expiresInSeconds: Math.max(0, Math.floor((deposit.expiresAt.getTime() - Date.now()) / 1000)),
      upiUri, upiDeepLink: upiUri, qrCodeDataUrl, qrCodeUrl: qrCodeDataUrl,
    };
  }

  // Shared by webhook, UTR claim and manual approval. Caller owns the transaction.
  private async approve(tx: Prisma.TransactionClient, depositId: string, receiptId: string, claimStatus: string, adminId?: string) {
    const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
    const receipt = await tx.unmatchedPayment.findUnique({ where: { id: receiptId } });
    if (!deposit || !receipt?.utr) throw new Error('Deposit or bank reference not found');
    if (!approvable.includes(deposit.status)) throw new Error(`Deposit is ${deposit.status}`);
    if (receipt.status !== 'UNCLAIMED') throw new Error('Payment has already been assigned');
    if (toPaise(receipt.amount) !== toPaise(deposit.totalAmount)) throw new Error('Bank payment amount does not match the deposit amount');
    const claimed = await tx.deposit.updateMany({
      where: { id: deposit.id, status: { in: approvable } },
      data: { status: 'APPROVED', utr: receipt.utr, claimStatus, approvedAt: new Date(), activeAmountKey: null },
    });
    if (claimed.count !== 1) throw new Error('Deposit was already processed');
    await tx.unmatchedPayment.update({ where: { id: receipt.id }, data: {
      status: 'ASSIGNED', assignedDepositId: deposit.id, assignedUserId: deposit.userId, resolvedAt: new Date(),
    } });
    await tx.transaction.create({ data: {
      userId: deposit.userId, amount: deposit.baseAmount, type: 'DEPOSIT', referenceId: deposit.id,
      idempotencyKey: `payment:${receipt.utr}`,
      description: `UPI deposit credited: ₹${deposit.baseAmount.toFixed(2)} (UTR: ${receipt.utr})`,
    } });
    const wallet = await moveWallet(tx, deposit.userId, deposit.baseAmount);
    if (adminId) await tx.auditLog.create({ data: {
      actorId: adminId, targetId: deposit.userId, action: 'MANUAL_DEPOSIT_APPROVE',
      details: JSON.stringify({ depositId, amount: deposit.baseAmount, utr: receipt.utr }),
    } });
    return {
      success: true as const, message: `₹${deposit.baseAmount.toFixed(2)} added to your wallet.`,
      deposit: (await tx.deposit.findUniqueOrThrow({ where: { id: deposit.id } })), wallet, userId: deposit.userId,
    };
  }

  private publishApproval(result: { userId: string; wallet: { balance: number; lockedBalance: number }; deposit?: { id: string; baseAmount: number; totalAmount: number; utr: string | null } }) {
    if (!this.io) return;
    const event = {
      depositId: result.deposit?.id, amount: result.deposit?.baseAmount,
      totalAmount: result.deposit?.totalAmount, utr: result.deposit?.utr, balance: result.wallet.balance,
    };
    this.io.to(`user:${result.userId}`).emit('deposit_approved', event);
    if (result.deposit) this.io.to(`deposit:${result.deposit.id}`).emit('deposit_approved', event);
    this.io.to(`user:${result.userId}`).emit('balance_updated', result.wallet);
    this.io.to('admin_channel').emit('admin_new_deposit', event);
  }

  async verifyIncomingPayment(amount: number, utr?: string, senderInfo?: { senderUpi?: string; senderName?: string; rawPayload?: any }) {
    const receivedAmount = money(amount);
    const cleanUtr = bankReference(utr);
    const result = await serializable(async tx => {
      // Include historical approvals created before receipt tracking was introduced.
      const approved = await tx.deposit.findUnique({ where: { utr: cleanUtr } });
      if (approved) {
        if (toPaise(approved.totalAmount) !== toPaise(receivedAmount)) throw new Error('UTR was previously received with a different amount');
        return { success: true as const, alreadyApproved: true, message: 'Payment already processed.' };
      }
      let receipt = await tx.unmatchedPayment.findUnique({ where: { utr: cleanUtr } });
      if (receipt && toPaise(receipt.amount) !== toPaise(receivedAmount)) throw new Error('UTR was previously received with a different amount');
      if (receipt && receipt.status !== 'UNCLAIMED') return { success: true as const, alreadyApproved: true, message: 'Payment already processed.' };
      if (!receipt) receipt = await tx.unmatchedPayment.create({ data: {
        amount: receivedAmount, utr: cleanUtr, senderUpi: senderInfo?.senderUpi,
        senderName: senderInfo?.senderName,
        rawPayload: senderInfo?.rawPayload ? JSON.stringify(senderInfo.rawPayload) : null,
      } });
      const claims = await tx.deposit.findMany({ where: {
        userClaimedUtr: cleanUtr, status: { in: approvable },
      } });
      let deposit = claims.length === 1 && toPaise(claims[0].totalAmount) === toPaise(receivedAmount) ? claims[0] : null;
      if (claims.length === 0) {
        // A reused amount is ambiguous: a late notification could belong to its
        // previous owner. Keep it unmatched until its UTR is claimed/verified.
        const sameAmount = await tx.deposit.findMany({ where: { totalAmount: receivedAmount }, take: 2 });
        if (sameAmount.length === 1 && ['PENDING', 'CLAIMED'].includes(sameAmount[0].status)
            && sameAmount[0].expiresAt > new Date()
            && (!sameAmount[0].userClaimedUtr || sameAmount[0].userClaimedUtr === cleanUtr)) deposit = sameAmount[0];
      }
      if (!deposit) return {
        success: false as const, unmatched: true, unmatchedPaymentId: receipt.id,
        message: 'Bank payment recorded for reconciliation. The UTR and exact amount must match one deposit.',
      };
      return this.approve(tx, deposit.id, receipt.id, 'AUTO_MATCHED');
    });
    if ('wallet' in result) this.publishApproval(result);
    else if ('unmatched' in result) this.io?.to('admin_channel').emit('admin_unmatched_payment', { id: result.unmatchedPaymentId });
    return result;
  }

  async claimDepositUtr(userId: string, depositId: string, utr: string) {
    const cleanUtr = bankReference(utr);
    const result = await serializable(async tx => {
      const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
      if (!deposit || deposit.userId !== userId) throw new Error('Deposit request not found');
      if (deposit.status === 'APPROVED') return { success: true as const, alreadyApproved: true, deposit, message: 'Deposit already credited.' };
      if (!approvable.includes(deposit.status)) throw new Error(`Cannot claim a ${deposit.status.toLowerCase()} deposit`);
      const duplicate = await tx.deposit.findFirst({ where: { id: { not: depositId }, OR: [
        { utr: cleanUtr }, { userClaimedUtr: cleanUtr, status: { in: approvable } },
      ] } });
      if (duplicate) throw new Error('This UTR is already associated with another deposit');
      const receipt = await tx.unmatchedPayment.findUnique({ where: { utr: cleanUtr } });
      if (receipt) {
        const approved = await this.approve(tx, depositId, receipt.id, 'AUTO_MATCHED');
        return { ...approved, instantApproval: true };
      }
      const claimed = await tx.deposit.update({ where: { id: depositId }, data: {
        status: 'CLAIMED', userClaimedUtr: cleanUtr, claimStatus: 'CLAIMED_BY_USER',
      } });
      return { success: true as const, instantApproval: false, deposit: claimed, message: 'UTR recorded. Waiting for a bank payment with the exact expected amount.' };
    });
    if ('wallet' in result) this.publishApproval(result);
    else this.io?.to('admin_channel').emit('admin_deposit_claimed', { depositId });
    return result;
  }

  async adminApproveDeposit(depositId: string, utr: string, adminId: string) {
    const cleanUtr = bankReference(utr);
    const result = await serializable(async tx => {
      const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
      if (!deposit) throw new Error('Deposit request not found');
      if (!approvable.includes(deposit.status)) throw new Error(`Deposit is ${deposit.status}`);
      const duplicate = await tx.deposit.findUnique({ where: { utr: cleanUtr } });
      if (duplicate) throw new Error('UTR has already been credited');
      // An admin may attest to a bank payment not received by the listener.
      // An existing receipt's amount must never be overwritten to fit a deposit.
      let receipt = await tx.unmatchedPayment.findUnique({ where: { utr: cleanUtr } });
      if (!receipt) receipt = await tx.unmatchedPayment.create({ data: { amount: deposit.totalAmount, utr: cleanUtr } });
      return this.approve(tx, depositId, receipt.id, 'MANUALLY_VERIFIED', adminId);
    });
    this.publishApproval(result);
    return result;
  }

  async adminRejectDeposit(depositId: string, reason: string, adminId: string) {
    return serializable(async tx => {
      const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
      if (!deposit || !approvable.includes(deposit.status)) throw new Error('Deposit cannot be rejected');
      const updated = await tx.deposit.update({ where: { id: depositId }, data: { status: 'REJECTED', claimStatus: 'REJECTED_BY_ADMIN', activeAmountKey: null } });
      await tx.auditLog.create({ data: { actorId: adminId, targetId: deposit.userId, action: 'REJECT_DEPOSIT_CLAIM', details: JSON.stringify({ depositId, reason }) } });
      return { success: true, deposit: updated, message: 'Deposit rejected.' };
    });
  }

  async assignUnmatchedPayment(unmatchedId: string, userId: string, adminId: string) {
    const result = await serializable(async tx => {
      const receipt = await tx.unmatchedPayment.findUnique({ where: { id: unmatchedId } });
      if (!receipt || receipt.status !== 'UNCLAIMED') throw new Error('Payment is unavailable or already assigned');
      money(receipt.amount);
      if (!receipt.utr) throw new Error('A verified bank UTR is required before assignment');
      if (await tx.deposit.findUnique({ where: { utr: receipt.utr } })) throw new Error('UTR has already been credited');
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.status !== 'ACTIVE') throw new Error('Active target user required');
      const unmatched = await tx.unmatchedPayment.update({ where: { id: receipt.id }, data: {
        status: 'ASSIGNED', assignedUserId: userId, resolvedAt: new Date(),
      } });
      await tx.transaction.create({ data: {
        userId, amount: receipt.amount, type: 'DEPOSIT', referenceId: `UNMATCHED-${receipt.id}`,
        idempotencyKey: `payment:${receipt.utr}`, description: `Bank payment assigned (UTR: ${receipt.utr})`,
      } });
      const wallet = await moveWallet(tx, userId, receipt.amount);
      await tx.auditLog.create({ data: { actorId: adminId, targetId: userId, action: 'ASSIGN_UNMATCHED_PAYMENT', details: JSON.stringify({ unmatchedId, utr: receipt.utr, amount: receipt.amount }) } });
      return { success: true, userId, unmatched, wallet, message: 'Payment assigned and credited.' };
    });
    this.publishApproval(result);
    return result;
  }

  getUnmatchedPayments(statusFilter = 'UNCLAIMED') {
    return prisma.unmatchedPayment.findMany({ where: statusFilter === 'ALL' ? {} : { status: statusFilter }, orderBy: { createdAt: 'desc' }, take: 50 });
  }
  getUserDeposits(userId: string) {
    return prisma.deposit.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }
  async getDepositStatus(depositId: string, userId: string) {
    return serializable(async tx => {
      const existing = await tx.deposit.findFirst({ where: { id: depositId, userId } });
      if (!existing) throw new Error('Deposit request not found');
      await this.expire(tx);
      const deposit = await tx.deposit.findUniqueOrThrow({ where: { id: depositId } });
      return { status: deposit.status, deposit };
    });
  }
  expireOldDeposits() { return serializable(tx => this.expire(tx)); }
}
export const paymentService = new PaymentService();
