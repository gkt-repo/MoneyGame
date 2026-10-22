import './test-env';
import assert from 'assert/strict';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { prisma, initDbDefaults } from '../src/db';
import { config } from '../src/config';
import { router } from '../src/routes/api.routes';
import { moderatorService } from '../src/modules/moderator/moderator.service';
import { cashDeskService } from '../src/modules/moderator/cash-desk.service';
import { paymentService } from '../src/modules/payment/payment.service';
import { walletService } from '../src/modules/wallet/wallet.service';
import { adminService } from '../src/modules/admin/admin.service';
import { toPaise } from '../src/money';

async function run() {
  await initDbDefaults();
  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
  const mods: { id: string; username: string; accountId: string; upiId: string }[] = [];
  for (let i = 0; i < 2; i++) {
    const mod = await moderatorService.create({ username: `float_mod_${i}`, password: 'Float-password-123!', upiId: `float${i}@bank`, receiverName: `Desk ${i}` }, admin.id);
    const device = await moderatorService.listenerConfig(mod.id);
    await moderatorService.heartbeat(device.account.id, { listenerConnected: true });
    mods.push({ ...mod, accountId: device.account.id, upiId: device.account.upiId });
  }
  const players = await Promise.all(Array.from({ length: 8 }, (_, i) => prisma.user.create({ data: { username: `float_player_${i}`, wallet: { create: { balance: 10000 } } } })));
  // Use approved bank receipts, rather than injecting cached balances.
  for (let i = 0; i < mods.length; i++) {
    const dep = await prisma.deposit.create({ data: { userId: players[i].id, baseAmount: 100, totalAmount: 100.25,
      offsetPaise: 25, receivingUpi: mods[i].upiId, upiAccountId: mods[i].accountId, expiresAt: new Date(Date.now() + 60000) } });
    await paymentService.adminApproveDeposit(dep.id, `FLOAT_DEPOSIT_${i}`, mods[i].id);
    assert.equal((await prisma.upiAccount.findUniqueOrThrow({ where: { id: mods[i].accountId } })).currentBalance, 100.25);
    await assert.rejects(paymentService.adminApproveDeposit(dep.id, `FLOAT_DEPOSIT_${i}`, mods[i].id));
  }
  const app = express(); app.use(express.json()); app.use('/api', router);
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const call = (path: string, who = mods[0].id, body?: any) => fetch(url + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ userId: who, role: who === admin.id ? 'SUPER_ADMIN' : 'MODERATOR', tokenVersion: 0 }, config.jwtSecret, { audience: config.adminAudience })}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    for (const mod of mods) for (const query of ['', '?status=APPROVED', '?skip=1', '?status=ALL']) {
      const data = await (await call(`/admin/deposits${query}`, mod.id)).json() as any;
      assert(data.deposits.every((d: any) => d.receivingUpi === mod.upiId));
    }
    const foreignDeposit = await prisma.deposit.create({ data: { userId: players[0].id, baseAmount: 12, totalAmount: 12.13, offsetPaise: 13, receivingUpi: mods[1].upiId, upiAccountId: mods[1].accountId, expiresAt: new Date() } });
    for (const action of ['approve', 'reject']) assert.equal((await call(`/admin/deposits/${foreignDeposit.id}/${action}`, mods[0].id, { utr: 'WRONG_OWNER_123', reason: 'No' })).status, 403);
    assert.equal(await prisma.unmatchedPayment.count({ where: { utr: 'WRONG_OWNER_123' } }), 0);
    const noAccount = await moderatorService.create({ username: 'no_account_mod', password: 'Float-password-123!' }, admin.id);
    assert.deepEqual((await (await call('/admin/deposits', noAccount.id)).json() as any).deposits, []);
    console.log('PASS: deposit reads and writes enforce receiving-account ownership');

    const requests = await Promise.all(players.slice(0, 3).map(p => walletService.requestWithdrawal(p.id, 80, 'player@bank')));
    const assigned = requests.map(r => r.withdrawal).filter(w => w.assignedModeratorId);
    const waiting = requests.map(r => r.withdrawal).find(w => !w.assignedModeratorId)!;
    assert.equal(assigned.length, 2);
    assert.equal(new Set(assigned.map(w => w.assignedModeratorId)).size, 2);
    for (const a of await moderatorService.pool()) { assert.equal(a.reservedPayouts, 80); assert.equal(a.availableBalance, 20.25); }
    const w = assigned[0]; const owner = mods.find(m => m.id === w.assignedModeratorId)!; const other = mods.find(m => m.id !== owner.id)!;
    for (const query of ['', '?status=PENDING', '?skip=1', '?status=ALL']) {
      const data = await (await call(`/admin/withdrawals${query}`, owner.id)).json() as any;
      assert(data.withdrawals.every((d: any) => d.assignedModeratorId === owner.id));
    }
    for (const path of ['claim', 'complete', 'reject']) assert.equal((await call(`/admin/withdrawals/${path}`, other.id, { withdrawalId: w.id, payoutUtr: 'FLOAT_PAYOUT_123' })).status, 403);
    assert.equal((await call('/admin/withdrawals/claim', other.id, { withdrawalId: waiting.id })).status, 403);
    const races = await Promise.allSettled([walletService.claimWithdrawal(w.id, owner.id), walletService.claimWithdrawal(w.id, admin.id)]);
    assert.equal(races.filter(r => r.status === 'fulfilled').length, 1);
    const claimed = await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    await prisma.withdrawal.update({ where: { id: w.id }, data: { assignedAt: new Date(Date.now() - 20 * 60000) } });
    await cashDeskService.routePending();
    assert.equal((await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).processingById, claimed.processingById);
    await assert.rejects(cashDeskService.reassign(w.id, other.id, admin.id), /unclaimed/);
    const settled = await Promise.allSettled([walletService.completeWithdrawal(w.id, 'FLOAT_PAYOUT_123', claimed.processingById!), walletService.completeWithdrawal(w.id, 'FLOAT_PAYOUT_123', claimed.processingById!)]);
    assert.equal(settled.filter(r => r.status === 'fulfilled').length, 1);
    let a = await prisma.upiAccount.findUniqueOrThrow({ where: { id: owner.accountId } });
    assert.equal(a.currentBalance, 20.25); assert.equal(a.totalPaidOut, 80); assert.equal(a.reservedPayouts, 0);
    assert.equal(await prisma.cashDeskEntry.count({ where: { sourceKey: `withdrawal:${w.id}` } }), 1);
    console.log('PASS: concurrent reservations, exclusive visibility, claim races, settlement retries and processing timeout safety');

    const second = assigned[1];
    await walletService.rejectWithdrawal(second.id, 'Unpaid', admin.id);
    assert.equal((await prisma.upiAccount.findUniqueOrThrow({ where: { id: second.payoutAccountId! } })).reservedPayouts, 0);
    await cashDeskService.routePending();
    const nowAssigned = await prisma.withdrawal.findUniqueOrThrow({ where: { id: waiting.id } });
    assert(nowAssigned.assignedModeratorId);
    await walletService.rejectWithdrawal(waiting.id, 'Unpaid', admin.id);
    const small = (await walletService.requestWithdrawal(players[3].id, 10, 'player@bank')).withdrawal;
    await prisma.withdrawal.update({ where: { id: small.id }, data: { assignedAt: new Date(Date.now() - 16 * 60000) } });
    await cashDeskService.routePending();
    const moved = await prisma.withdrawal.findUniqueOrThrow({ where: { id: small.id } });
    assert(moved.assignedModeratorId); assert.notEqual(moved.assignedModeratorId, small.assignedModeratorId);
    assert.equal((await call('/admin/withdrawals/claim', small.assignedModeratorId!, { withdrawalId: small.id })).status, 403);
    await assert.rejects(moderatorService.saveUpi(moved.payoutAccountId!, { assignedUserId: null }, admin.id), /active payouts/);
    await walletService.rejectWithdrawal(small.id, 'Unpaid', admin.id);
    console.log('PASS: rejection releases funds; unassigned requests retry; timeout changes one owner and invalidates stale claims');

    await prisma.upiAccount.updateMany({ data: { isActive: false } });
    const external = (await walletService.requestWithdrawal(players[4].id, 10, 'player@bank')).withdrawal;
    await assert.rejects(walletService.claimWithdrawal(external.id, admin.id), /external admin funds/);
    await walletService.claimWithdrawal(external.id, admin.id, 'EXTERNAL');
    const before = await prisma.upiAccount.findMany();
    await walletService.completeWithdrawal(external.id, 'EXTERNAL_PAYOUT_123', admin.id);
    assert.deepEqual(await prisma.upiAccount.findMany(), before);
    // A migrated account stays out of routing until its bank opening float is confirmed.
    await prisma.upiAccount.update({ where: { id: owner.accountId }, data: { floatReady: false, isActive: true } });
    await assert.rejects(cashDeskService.confirmOpeningBalance(owner.accountId, 50, 'Bank checked', owner.id), /Super Admin/);
    await cashDeskService.confirmOpeningBalance(owner.accountId, 50, 'Bank checked; legacy payouts reconciled', admin.id);
    await assert.rejects(cashDeskService.confirmOpeningBalance(owner.accountId, 50, 'Again', admin.id), /already/);
    a = await prisma.upiAccount.findUniqueOrThrow({ where: { id: owner.accountId } });
    assert.equal(a.currentBalance, 50); assert.equal(a.floatReady, true);
    const recovery = (await walletService.requestWithdrawal(players[5].id, 10, 'player@bank')).withdrawal;
    await walletService.claimWithdrawal(recovery.id, owner.id);
    await assert.rejects(walletService.completeWithdrawal(recovery.id, 'RECOVERY_UTR_123', admin.id), /another operator/);
    await assert.rejects(walletService.rejectWithdrawal(recovery.id, 'Unpaid', admin.id), /another operator/);
    assert.equal((await call('/admin/withdrawals/reconcile', other.id, { withdrawalId: recovery.id, outcome: 'PAID', note: 'Bank record checked', payoutUtr: 'RECOVERY_UTR_123' })).status, 403);
    assert.equal((await call('/admin/withdrawals/reconcile', admin.id, { withdrawalId: recovery.id, outcome: 'PAID', note: 'Bank record checked with original operator', payoutUtr: 'RECOVERY_UTR_123' })).status, 200);
    const duplicate = (await walletService.requestWithdrawal(players[6].id, 10, 'player@bank')).withdrawal;
    await walletService.claimWithdrawal(duplicate.id, owner.id);
    await assert.rejects(walletService.completeWithdrawal(duplicate.id, 'RECOVERY_UTR_123', owner.id), /already been recorded/);
    assert.equal((await prisma.upiAccount.findUniqueOrThrow({ where: { id: owner.accountId } })).reservedPayouts, 10);
    assert.equal((await call('/admin/withdrawals/reconcile', admin.id, { withdrawalId: duplicate.id, outcome: 'NOT_PAID', note: 'Bank confirms no transfer, operator has stopped payment' })).status, 200);
    assert.equal((await prisma.upiAccount.findUniqueOrThrow({ where: { id: owner.accountId } })).reservedPayouts, 0);
    console.log('PASS: locked payout recovery requires Super Admin bank evidence; duplicate UTR rolls back safely');
    for (const account of await prisma.upiAccount.findMany()) {
      const entries = await prisma.cashDeskEntry.findMany({ where: { accountId: account.id } });
      assert.equal(toPaise(account.currentBalance), entries.reduce((sum, e) => sum + toPaise(e.amount), 0));
      assert.equal(toPaise(account.currentBalance), toPaise(account.totalDeposited) - toPaise(account.totalPaidOut) + toPaise(account.openingAdjustment));
    }
    const stats = await adminService.getDashboardStats();
    assert.equal(stats.totalDepositVolume, 200); // Matched receipts are not double-counted.
    assert.equal(stats.totalFleetBalance, 140.25);
    console.log('PASS: explicit external funding, audited opening reconciliation, ledger conservation and fleet totals');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  await prisma.$disconnect();
}
run().catch(async e => { console.error(e); await prisma.$disconnect(); process.exitCode = 1; });
