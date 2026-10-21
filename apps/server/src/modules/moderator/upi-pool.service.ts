import { Prisma } from '@prisma/client';

export const istDay = (now = new Date()) => new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
export const online = (account: { lastHeartbeatAt: Date | null; listenerConnected: boolean }, now = new Date()) =>
  account.listenerConnected && !!account.lastHeartbeatAt && now.getTime() - account.lastHeartbeatAt.getTime() < 180000;

// The caller also creates the deposit inside the same serializable transaction.
export async function reserveUpi(tx: Prisma.TransactionClient, now = new Date()) {
  const day = istDay(now);
  const pool = await tx.upiAccount.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { assignedUser: { select: { status: true } }, usage: { where: { day } } },
  });
  if (!pool.length) return null; // Legacy installations with no pool only.
  const eligible = pool.filter(a => a.isActive && (!a.assignedUserId ||
    (a.assignedUser?.status === 'ACTIVE' && !!a.listenerTokenHash && online(a, now))) && (a.usage[0]?.issuedCount || 0) < a.dailyLimit);
  if (!eligible.length) throw new Error('Deposits are temporarily paused: no online UPI channel has capacity.');
  const setting = await tx.systemSetting.findUnique({ where: { key: 'upi_rotation_batch_size' } });
  const batchSize = Math.max(1, Math.min(100, Number(setting?.value) || 2));
  const state = await tx.systemSetting.findUnique({ where: { key: 'upi_rotation_cursor' } });
  let cursor: { day?: string; id?: string; count?: number } = {};
  try { cursor = JSON.parse(state?.value || '{}'); } catch { /* initialize */ }
  if (cursor.day !== day) cursor = {};
  let chosen = eligible.find(a => a.id === cursor.id && (cursor.count || 0) < batchSize);
  const continuing = !!chosen;
  if (!chosen) {
    const index = pool.findIndex(a => a.id === cursor.id);
    const ordered = [...pool.slice(index + 1), ...pool.slice(0, index + 1)];
    chosen = ordered.find(a => eligible.some(e => e.id === a.id))!;
  }
  const value = JSON.stringify({ day, id: chosen.id, count: continuing ? (cursor.count || 0) + 1 : 1 });
  await tx.systemSetting.upsert({ where: { key: 'upi_rotation_cursor' }, create: { key: 'upi_rotation_cursor', value }, update: { value } });
  await tx.upiDailyUsage.upsert({
    where: { accountId_day: { accountId: chosen.id, day } },
    create: { accountId: chosen.id, day, issuedCount: 1 }, update: { issuedCount: { increment: 1 } },
  });
  await tx.upiAccount.update({ where: { id: chosen.id }, data: { lastUsedAt: now } });
  return { id: chosen.id, upiId: chosen.upiId, day };
}
