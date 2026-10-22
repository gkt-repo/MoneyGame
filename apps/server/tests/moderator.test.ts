import './test-env';
import assert from 'assert/strict';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { prisma, initDbDefaults } from '../src/db';
import { moderatorService } from '../src/modules/moderator/moderator.service';
import { reserveUpi, istDay } from '../src/modules/moderator/upi-pool.service';
import { paymentService } from '../src/modules/payment/payment.service';
import { walletService } from '../src/modules/wallet/wallet.service';
import { serializable } from '../src/transaction';
import { router } from '../src/routes/api.routes';
import { config } from '../src/config';

async function run() {
  await initDbDefaults();
  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
  const users = [];
  const devices = [];
  for (let i = 0; i < 3; i++) {
    const mod = await moderatorService.create({ username: `operator_${i}`, password: 'Moderator-test-password!', upiId: `mod${i}@bank`, receiverName: `Desk ${i}`, dailyLimit: 5 }, admin.id);
    users.push(mod);
    const device = await moderatorService.listenerConfig(mod.id);
    devices.push(device);
    await moderatorService.heartbeat(device.account.id, { listenerConnected: true, batteryLevel: 90, phoneModel: 'Test phone' });
  }
  const player = await prisma.user.create({ data: { username: 'player', wallet: { create: { balance: 2000 } } } });
  const player2 = await prisma.user.create({ data: { username: 'player_two', wallet: { create: { balance: 1000 } } } });
  const deposits = [];
  for (let i = 0; i < 15; i++) deposits.push(await paymentService.createDepositRequest(player.id, 100 + i));
  assert.deepEqual(deposits.map(d => d.receivingUpi), [0,0,1,1,2,2,0,0,1,1,2,2,0,1,2].map(n => `mod${n}@bank`));
  await assert.rejects(paymentService.createDepositRequest(player.id, 200), /paused/);
  assert((await moderatorService.pool()).every(a => a.issuedCount === 5 && a.poolStatus === 'CAP_REACHED'));
  console.log('PASS: repeated batch-of-two rotation, partial final batches and issued-slot cap');

  assert.equal(istDay(new Date('2026-10-21T18:29:59Z')), '2026-10-21');
  assert.equal(istDay(new Date('2026-10-21T18:30:00Z')), '2026-10-22');
  const tomorrow = new Date(Date.now() + 86400000);
  await prisma.upiAccount.updateMany({ data: { lastHeartbeatAt: tomorrow } });
  const firstTomorrow = await serializable(tx => reserveUpi(tx, tomorrow));
  assert.equal(firstTomorrow?.upiId, 'mod0@bank');
  assert.equal((await prisma.upiDailyUsage.findUniqueOrThrow({ where: { accountId_day: { accountId: devices[0].account.id, day: istDay(tomorrow) } } })).issuedCount, 1);
  await prisma.upiAccount.updateMany({ data: { lastHeartbeatAt: new Date(), dailyLimit: 15 } });
  console.log('PASS: IST midnight creates fresh quota and resets pointer');

  const app = express(); app.use(express.json()); app.use('/api', router);
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const token = (id: string, role: string) => jwt.sign({ userId: id, role, tokenVersion: 0 }, config.jwtSecret, { audience: config.adminAudience, expiresIn: 900 });
  const modToken = token(users[0].id, 'MODERATOR');
  const call = async (path: string, body?: any, secret?: string, method?: string, bearer = modToken) => fetch(base + path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, ...(secret ? { 'x-webhook-secret': secret } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    for (const path of ['/admin/deposits','/admin/withdrawals','/admin/feedback','/admin/moderator-status','/admin/auth/me']) assert.equal((await call(path)).status, 200, path);
    for (const path of ['/admin/stats','/admin/users','/admin/rooms','/admin/solvency-audit','/admin/moderators','/admin/upi-pool','/admin/unmatched-payments']) assert.equal((await call(path)).status, 403, path);
    for (const path of ['/admin/upi-settings', `/admin/users/${player.id}/adjust-balance`, '/admin/moderators']) assert.equal((await call(path, {})).status, 403, path);
    const configResponse = await (await call('/admin/listener-config')).json() as any;
    assert(configResponse.webhookSecret.startsWith('mg_listener_'));
    assert.notEqual(configResponse.webhookSecret, config.webhookSecret);
    devices[0] = configResponse;
    assert.equal((await call('/webhooks/listener-heartbeat', { listenerConnected: true, batteryLevel: 8 }, devices[0].webhookSecret)).status, 200);
    assert((await moderatorService.pool())[0].lowBattery);
    console.log('PASS: moderator endpoint allowlist and scoped listener credential');

    const dep = await paymentService.createDepositRequest(player2.id, 350);
    const receiver = devices.find(d => d.account.upiId === dep.receivingUpi)!;
    const wrong = devices.find(d => d.account.upiId !== dep.receivingUpi)!;
    const wrongResult = await (await call('/webhooks/upi-notify', { amount: dep.totalAmount, utr: '123456789009' }, wrong.webhookSecret)).json() as any;
    assert.equal(wrongResult.unmatched, true);
    await assert.rejects(paymentService.claimDepositUtr(player2.id, dep.depositId, '123456789009'), /different UPI/);
    const initial = (await walletService.getWallet(player2.id))!.balance;
    const results = await Promise.all(Array.from({ length: 3 }, () => call('/webhooks/upi-notify', { amount: dep.totalAmount, utr: '123456789001' }, receiver.webhookSecret)));
    assert(results.every(r => r.status === 200));
    assert.equal((await walletService.getWallet(player2.id))!.balance, initial + 350);
    assert.equal((await moderatorService.pool()).find(a => a.upiId === dep.receivingUpi)!.todayTxCount, 1);
    console.log('PASS: receiving-account binding and duplicate deliveries credit/count once');

    const withdrawal = await walletService.requestWithdrawal(player2.id, 100, 'player@bank');
    const claims = await Promise.allSettled(users.map(u => walletService.claimWithdrawal(withdrawal.withdrawal.id, u.id)));
    assert.equal(claims.filter(r => r.status === 'fulfilled').length, 1);
    const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.withdrawal.id } });
    const other = users.find(u => u.id !== w.processingById)!;
    await assert.rejects(walletService.completeWithdrawal(w.id, '123456789002', other.id), /another operator/);
    await walletService.completeWithdrawal(w.id, '123456789002', w.processingById!);
    assert.equal((await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).processedById, w.processingById);
    console.log('PASS: payout ownership, race protection and operator audit');

    const parallel = await Promise.all(users.map((_, i) => paymentService.createDepositRequest(player.id, 500 + i)));
    assert.equal(new Set(parallel.map(d => d.depositId)).size, 3);
    await moderatorService.rotation(1, admin.id);
    const singleBatch = [];
    for (let i = 0; i < 3; i++) singleBatch.push(await paymentService.createDepositRequest(player.id, 550 + i));
    assert.equal(new Set(singleBatch.map(d => d.receivingUpi)).size, 3);
    for (const a of await moderatorService.pool()) await prisma.upiAccount.update({ where: { id: a.id }, data: { dailyLimit: a.issuedCount + 1 } });
    const competing = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => paymentService.createDepositRequest(player.id, 570 + i)));
    assert.equal(competing.filter(r => r.status === 'fulfilled').length, 3);
    assert((await moderatorService.pool()).every(a => a.issuedCount === a.dailyLimit));
    await prisma.upiAccount.updateMany({ data: { dailyLimit: 15 } });
    console.log('PASS: configurable batch size and concurrent requests at capacity');
    await moderatorService.update(users[0].id, { status: 'SUSPENDED' }, admin.id);
    assert.equal(await moderatorService.device(devices[0].webhookSecret), null);
    assert.equal((await call('/admin/deposits')).status, 401);
    assert.equal((await call('/webhooks/upi-notify', { amount: 1, utr: '123456789003' }, devices[0].webhookSecret)).status, 401);
    assert(await moderatorService.device(devices[1].webhookSecret));
    assert.notEqual((await paymentService.createDepositRequest(player.id, 600)).receivingUpi, 'mod0@bank');
    const otherDevice = devices[1];
    await moderatorService.update(users[1].id, { password: 'New-moderator-password!' }, admin.id);
    assert.equal(await moderatorService.device(otherDevice.webhookSecret), null);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: users[1].id } })).status, 'ACTIVE');
    await moderatorService.update(users[2].id, { status: 'BANNED' }, admin.id);
    assert(await prisma.user.findUnique({ where: { id: users[2].id } }));
    assert(await prisma.withdrawal.findUnique({ where: { id: w.id } }));
    await prisma.upiAccount.updateMany({ data: { isActive: false } });
    await assert.rejects(paymentService.createDepositRequest(player.id, 601), /paused/);
    console.log('PASS: independent revocation, inactive-channel skip and no legacy bypass');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  await prisma.$disconnect();
}
run().catch(async e => { console.error(e); await prisma.$disconnect(); process.exitCode = 1; });
