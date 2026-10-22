import { availableFloat } from './cash-desk.service';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../db';
import { serializable } from '../../transaction';
import { istDay, online } from './upi-pool.service';

export const listenerHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const positiveInt = (v: unknown, fallback: number, max = 10000) => {
  const n = v === undefined ? fallback : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > max) throw new Error(`Expected an integer between 1 and ${max}`);
  return n;
};
const upiData = (b: any) => {
  if (typeof b.upiId !== 'string' || !/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(b.upiId.trim())) throw new Error('Valid receiving UPI required');
  if (typeof b.receiverName !== 'string' || !b.receiverName.trim() || b.receiverName.length > 100) throw new Error('Receiver name required');
  return { upiId: b.upiId.trim().toLowerCase(), receiverName: b.receiverName.trim(), dailyLimit: positiveInt(b.dailyLimit, 15) };
};
const passwordHash = async (password: unknown) => {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 72) throw new Error('Password must be at least 12 characters and at most 72 bytes');
  return bcrypt.hash(password, 12);
};
const audit = (actorId: string, action: string, targetId?: string, details?: any) => ({ actorId, action, targetId, details: JSON.stringify(details || {}) });

export class ModeratorService {
  private io: any;
  setSocketServer(io: any) { this.io = io; }
  private disconnect(id: string) { this.io?.in(`user:${id}`).disconnectSockets(true); }

  async pool() {
    const accounts = await prisma.upiAccount.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { usage: { where: { day: istDay() } }, assignedUser: { select: { username: true, status: true } } } });
    return accounts.map(({ listenerTokenHash, usage, ...a }) => ({ ...a, availableBalance: availableFloat(a),
      todayTxCount: usage[0]?.receivedCount || 0, issuedCount: usage[0]?.issuedCount || 0,
      remaining: Math.max(0, a.dailyLimit - (usage[0]?.issuedCount || 0)),
      deviceStatus: listenerTokenHash && online(a) ? 'ONLINE' : 'OFFLINE',
      poolStatus: !a.isActive || (a.assignedUser && a.assignedUser.status !== 'ACTIVE') ? 'DISABLED' :
        (usage[0]?.issuedCount || 0) >= a.dailyLimit ? 'CAP_REACHED' : a.assignedUserId && (!listenerTokenHash || !online(a)) ? 'OFFLINE' : 'AVAILABLE',
      lowBattery: a.batteryLevel !== null && a.batteryLevel < 15,
    }));
  }
  async list() {
    const [users, pool] = await Promise.all([
      prisma.user.findMany({ where: { role: 'MODERATOR' }, select: { id: true, username: true, email: true, phone: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' } }), this.pool(),
    ]);
    return users.map(u => ({ ...u, upiAccount: pool.find(a => a.assignedUserId === u.id) || null }));
  }
  async create(b: any, actorId: string) {
    if (typeof b.username !== 'string' || !/^[\w.\-]{3,50}$/.test(b.username)) throw new Error('Username must contain 3–50 letters, numbers, dots, hyphens or underscores');
    const hash = await passwordHash(b.password);
    const data = b.upiId ? upiData(b) : null;
    return serializable(async tx => {
      const user = await tx.user.create({ data: { username: b.username, passwordHash: hash, role: 'MODERATOR',
        email: typeof b.email === 'string' ? b.email : null, phone: typeof b.phone === 'string' ? b.phone : null },
        select: { id: true, username: true, status: true } });
      if (data) await tx.upiAccount.create({ data: { ...data, assignedUserId: user.id, sortOrder: await tx.upiAccount.count() } });
      await tx.auditLog.create({ data: audit(actorId, 'CREATE_MODERATOR', user.id) });
      return user;
    });
  }
  async update(id: string, b: any, actorId: string) {
    if (b.username !== undefined && (typeof b.username !== 'string' || !/^[\w.\-]{3,50}$/.test(b.username))) throw new Error('Invalid username');
    const hash = b.password !== undefined ? await passwordHash(b.password) : undefined;
    if (b.status !== undefined && !['ACTIVE', 'SUSPENDED', 'BANNED'].includes(b.status)) throw new Error('Invalid moderator status');
    const result = await serializable(async tx => {
      const user = await tx.user.findUnique({ where: { id } });
      if (user?.role !== 'MODERATOR') throw new Error('Moderator not found');
      const revoke = hash !== undefined || b.status !== undefined || b.username !== undefined;
      const updated = await tx.user.update({ where: { id }, data: { username: b.username, status: b.status, passwordHash: hash,
        ...(revoke ? { tokenVersion: { increment: 1 } } : {}) }, select: { id: true, username: true, status: true } });
      if (revoke) {
        await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.upiAccount.updateMany({ where: { assignedUserId: id }, data: { listenerTokenHash: null, listenerConnected: false, lastHeartbeatAt: null } });
      }
      await tx.auditLog.create({ data: audit(actorId, 'UPDATE_MODERATOR', id, { username: b.username, status: b.status, passwordReset: !!hash }) });
      return updated;
    });
    this.disconnect(id);
    return result;
  }
  async saveUpi(id: string | null, b: any, actorId: string) {
    const result = await serializable(async tx => {
      const previous = id ? await tx.upiAccount.findUniqueOrThrow({ where: { id } }) : null;
      const data = upiData({ ...previous, ...b });
      const assignedUserId = b.assignedUserId === undefined ? previous?.assignedUserId || null : b.assignedUserId || null;
      if (assignedUserId) {
        const user = await tx.user.findUnique({ where: { id: assignedUserId } });
        if (user?.role !== 'MODERATOR') throw new Error('Assign a moderator account');
      }
      if (b.isActive !== undefined && typeof b.isActive !== 'boolean') throw new Error('Invalid active flag');
      const sortOrder = b.sortOrder ?? previous?.sortOrder ?? await tx.upiAccount.count();
      if (!Number.isInteger(sortOrder) || sortOrder < 0) throw new Error('Invalid rotation order');
      // Preserve a receiving address once issued: outstanding payments must retain their owner.
      if (previous && previous.upiId !== data.upiId && (await tx.deposit.count({ where: { upiAccountId: id! } }) || await tx.cashDeskEntry.count({ where: { accountId: id! } }))) {
        throw new Error('This UPI has payment history. Disable it and add the replacement UPI separately.');
      }
      if (previous && previous.assignedUserId !== assignedUserId && await tx.withdrawal.count({ where: {
        status: { in: ['PENDING', 'PROCESSING'] }, OR: [{ payoutAccountId: previous.id },
          ...(previous.assignedUserId ? [{ assignedModeratorId: previous.assignedUserId }] : [])],
      } })) throw new Error('Resolve or reassign active payouts before changing the account owner');
      const changed = previous && (previous.upiId !== data.upiId || previous.assignedUserId !== assignedUserId || b.isActive === false);
      const values = { ...data, assignedUserId, sortOrder, isActive: b.isActive ?? previous?.isActive ?? true,
        ...(changed ? { listenerTokenHash: null, listenerConnected: false, lastHeartbeatAt: null } : {}) };
      const account = previous ? await tx.upiAccount.update({ where: { id: previous.id }, data: values }) : await tx.upiAccount.create({ data: values });
      await tx.auditLog.create({ data: audit(actorId, previous ? 'UPDATE_UPI' : 'CREATE_UPI', undefined, { id: account.id, upiId: account.upiId }) });
      return { id: account.id, previousOwner: previous?.assignedUserId };
    });
    if (result.previousOwner) this.disconnect(result.previousOwner);
    return { id: result.id };
  }
  async rotation(batchSize?: unknown, actorId?: string) {
    if (batchSize !== undefined) {
      const value = String(positiveInt(batchSize, 2, 100));
      await serializable(async tx => {
        await tx.systemSetting.upsert({ where: { key: 'upi_rotation_batch_size' }, create: { key: 'upi_rotation_batch_size', value }, update: { value } });
        await tx.auditLog.create({ data: audit(actorId!, 'UPDATE_UPI_ROTATION', undefined, { batchSize }) });
      });
    }
    return { batchSize: Number((await prisma.systemSetting.findUnique({ where: { key: 'upi_rotation_batch_size' } }))?.value || 2) };
  }
  async listenerConfig(userId: string) {
    const token = `mg_listener_${crypto.randomBytes(32).toString('hex')}`;
    const account = await serializable(async tx => {
      const a = await tx.upiAccount.findUnique({ where: { assignedUserId: userId }, include: { assignedUser: true } });
      if (!a || a.assignedUser?.status !== 'ACTIVE') throw new Error('Ask Super Admin to assign a UPI account');
      await tx.upiAccount.update({ where: { id: a.id }, data: { listenerTokenHash: listenerHash(token) } });
      return { id: a.id, upiId: a.upiId, receiverName: a.receiverName, dailyLimit: a.dailyLimit };
    });
    return { success: true, webhookSecret: token, account };
  }
  async device(token: string) {
    const account = await prisma.upiAccount.findUnique({ where: { listenerTokenHash: listenerHash(token) }, include: { assignedUser: true } });
    // Disabling routing does not discard payments already sent to an issued QR.
    if (!account || !account.assignedUser || account.assignedUser.status !== 'ACTIVE' || account.assignedUser.role !== 'MODERATOR') return null;
    return account;
  }
  async heartbeat(accountId: string, b: any) {
    if (b.batteryLevel !== undefined && (!Number.isInteger(b.batteryLevel) || b.batteryLevel < 0 || b.batteryLevel > 100)) throw new Error('Invalid battery level');
    await prisma.upiAccount.update({ where: { id: accountId }, data: { lastHeartbeatAt: new Date(), listenerConnected: b.listenerConnected === true,
      batteryLevel: b.batteryLevel, phoneModel: typeof b.phoneModel === 'string' ? b.phoneModel.slice(0, 100) : undefined } });
    return { success: true };
  }
}
export const moderatorService = new ModeratorService();
