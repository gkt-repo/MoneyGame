import { Prisma, Withdrawal } from '@prisma/client';
import { prisma } from '../../db';
import { money, toPaise } from '../../money';
import { serializable } from '../../transaction';
import { online } from './upi-pool.service';

export const forbidden = (message: string) => Object.assign(new Error(message), { statusCode: 403 });
export const availableFloat = (a: { currentBalance: number; reservedPayouts: number }) =>
  (toPaise(a.currentBalance) - toPaise(a.reservedPayouts)) / 100;

export async function operator(tx: Prisma.TransactionClient, id: string) {
  const user = await tx.user.findUnique({ where: { id } });
  if (!user || user.status !== 'ACTIVE' || !['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) throw forbidden('Operator access revoked');
  return user;
}

export async function checkDepositOwner(tx: Prisma.TransactionClient, id: string, receivingUpi: string) {
  const actor = await operator(tx, id);
  if (actor.role === 'MODERATOR') {
    const account = await tx.upiAccount.findUnique({ where: { assignedUserId: id } });
    if (!account || account.upiId !== receivingUpi) throw forbidden('This deposit belongs to another operator');
  }
}

// Always called inside the approval transaction, after the receipt has been claimed.
export async function creditFloat(tx: Prisma.TransactionClient, receivingUpi: string | null, amount: number, sourceKey: string) {
  if (!receivingUpi) return;
  const account = await tx.upiAccount.findUnique({ where: { upiId: receivingUpi } });
  if (!account) return; // Legacy central receiving account, outside the fleet.
  await tx.cashDeskEntry.create({ data: { accountId: account.id, amount, kind: 'DEPOSIT', sourceKey } });
  await tx.upiAccount.update({ where: { id: account.id }, data: {
    totalDeposited: (toPaise(account.totalDeposited) + toPaise(amount)) / 100,
    currentBalance: (toPaise(account.currentBalance) + toPaise(amount)) / 100,
  } });
}

export async function releaseFloat(tx: Prisma.TransactionClient, w: Withdrawal, paid = false, actorId?: string) {
  if (!w.payoutAccountId) return;
  const account = await tx.upiAccount.findUniqueOrThrow({ where: { id: w.payoutAccountId } });
  if (toPaise(account.reservedPayouts) < toPaise(w.amount)) throw new Error('Payout reservation is inconsistent; reconcile before continuing');
  if (paid && toPaise(account.currentBalance) < toPaise(w.amount)) throw new Error('Insufficient cash float');
  await tx.upiAccount.update({ where: { id: account.id }, data: {
    reservedPayouts: (toPaise(account.reservedPayouts) - toPaise(w.amount)) / 100,
    ...(paid ? {
      currentBalance: (toPaise(account.currentBalance) - toPaise(w.amount)) / 100,
      totalPaidOut: (toPaise(account.totalPaidOut) + toPaise(w.amount)) / 100,
    } : {}),
  } });
  if (paid) await tx.cashDeskEntry.create({ data: { accountId: account.id, amount: -w.amount, kind: 'PAYOUT', sourceKey: `withdrawal:${w.id}`, actorId } });
}

export async function assignPayout(tx: Prisma.TransactionClient, w: Withdrawal, now = new Date(), excludeId?: string, requestedId?: string) {
  const pool = await tx.upiAccount.findMany({ where: { isActive: true, floatReady: true, assignedUserId: { not: null } },
    include: { assignedUser: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  const eligible = pool.filter(a => a.assignedUser?.status === 'ACTIVE' && a.assignedUser.role === 'MODERATOR'
    && a.assignedUserId !== excludeId && !!a.listenerTokenHash && online(a, now)
    && toPaise(availableFloat(a)) >= toPaise(w.amount));
  const cursor = await tx.systemSetting.findUnique({ where: { key: 'payout_rotation_cursor' } });
  const index = pool.findIndex(a => a.id === cursor?.value);
  const ordered = [...pool.slice(index + 1), ...pool.slice(0, index + 1)];
  const chosen = requestedId ? eligible.find(a => a.assignedUserId === requestedId)
    : ordered.find(a => eligible.some(e => e.id === a.id));
  if (!chosen) {
    if (requestedId) throw new Error('Selected moderator is offline, unverified, or has insufficient available float');
    return w;
  }
  await tx.upiAccount.update({ where: { id: chosen.id }, data: { reservedPayouts: (toPaise(chosen.reservedPayouts) + toPaise(w.amount)) / 100 } });
  await tx.systemSetting.upsert({ where: { key: 'payout_rotation_cursor' }, create: { key: 'payout_rotation_cursor', value: chosen.id }, update: { value: chosen.id } });
  return tx.withdrawal.update({ where: { id: w.id }, data: {
    assignedModeratorId: chosen.assignedUserId, assignedAt: now, payoutAccountId: chosen.id, fundingSource: 'ACCOUNT',
  } });
}

class CashDeskService {
  private io: any;
  setSocketServer(io: any) { this.io = io; }
  async publish() {
    if (!this.io) return;
    // Invalidation only: no other operator's financial data is broadcast.
    this.io.to('admin_channel').emit('cash_desk_updated', {});
    const moderators = await prisma.user.findMany({ where: { role: 'MODERATOR', status: 'ACTIVE' }, select: { id: true } });
    for (const m of moderators) this.io.to(`user:${m.id}`).emit('cash_desk_updated', {});
  }
  changed() { this.publish().catch(e => console.error('Cash desk notification failed:', e.message)); }

  async routePending(now = new Date()) {
    const cutoff = new Date(now.getTime() - 15 * 60000);
    const ids = await prisma.withdrawal.findMany({ where: { status: 'PENDING', OR: [
      { assignedModeratorId: null }, { assignedAt: { lte: cutoff } },
    ] }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 200 });
    let changed = false;
    for (const { id } of ids) {
      changed = await serializable(async tx => {
        let w = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
        if (w.status !== 'PENDING' || (w.assignedModeratorId && (!w.assignedAt || w.assignedAt > cutoff))) return false;
        const old = w.assignedModeratorId;
        if (old) {
          await releaseFloat(tx, w);
          w = await tx.withdrawal.update({ where: { id }, data: { assignedModeratorId: null, assignedAt: null, payoutAccountId: null, fundingSource: null } });
        }
        const assigned = await assignPayout(tx, w, now, old || undefined);
        return !!old || !!assigned.assignedModeratorId;
      }) || changed;
    }
    if (changed) this.changed();
  }

  async reassign(id: string, moderatorId: string, actorId: string) {
    const result = await serializable(async tx => {
      if ((await operator(tx, actorId)).role !== 'SUPER_ADMIN') throw forbidden('Super Admin access required');
      let w = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
      if (w.status !== 'PENDING') throw new Error('Only unclaimed payouts can be reassigned');
      await releaseFloat(tx, w);
      w = await tx.withdrawal.update({ where: { id }, data: { assignedModeratorId: null, assignedAt: null, payoutAccountId: null, fundingSource: null } });
      const assigned = await assignPayout(tx, w, new Date(), undefined, moderatorId);
      await tx.auditLog.create({ data: { actorId, action: 'REASSIGN_WITHDRAWAL', targetId: w.userId, details: JSON.stringify({ withdrawalId: id, moderatorId }) } });
      return { success: true, withdrawal: assigned };
    });
    this.changed();
    return result;
  }

  async confirmOpeningBalance(accountId: string, balance: number, reason: string, actorId: string) {
    const amount = money(balance, 0);
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('Bank reconciliation note required');
    const result = await serializable(async tx => {
      if ((await operator(tx, actorId)).role !== 'SUPER_ADMIN') throw forbidden('Super Admin access required');
      const a = await tx.upiAccount.findUniqueOrThrow({ where: { id: accountId } });
      if (a.floatReady) throw new Error('Opening balance has already been confirmed');
      if (a.assignedUserId && await tx.withdrawal.count({ where: { processingById: a.assignedUserId, status: 'PROCESSING' } })) throw new Error('Resolve legacy processing payouts before confirming the bank balance');
      if (toPaise(amount) < toPaise(a.reservedPayouts)) throw new Error('Balance cannot be below reserved payouts');
      const adjustment = (toPaise(amount) - toPaise(a.currentBalance)) / 100;
      await tx.cashDeskEntry.create({ data: { accountId, amount: adjustment, kind: 'OPENING_ADJUSTMENT', sourceKey: `opening:${accountId}`, actorId } });
      await tx.auditLog.create({ data: { actorId, action: 'CONFIRM_OPENING_FLOAT', details: JSON.stringify({ accountId, balance: amount, adjustment, reason }) } });
      return tx.upiAccount.update({ where: { id: accountId }, data: { currentBalance: amount, openingAdjustment: adjustment, floatReady: true } });
    });
    this.changed();
    return { success: true, accountId: result.id };
  }
}
export const cashDeskService = new CashDeskService();
