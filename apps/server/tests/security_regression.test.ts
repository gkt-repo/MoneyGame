import './test-env';
import assert from 'assert/strict';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { io as connect, Socket } from 'socket.io-client';
import { prisma, initDbDefaults } from '../src/db';
import { router } from '../src/routes/api.routes';
import { paymentService } from '../src/modules/payment/payment.service';
import { walletService } from '../src/modules/wallet/wallet.service';
import { gameManager } from '../src/modules/game/game.manager';
import { emailService } from '../src/modules/auth/email.service';
import { authService } from '../src/modules/auth/auth.service';
import { config } from '../src/config';
import { configureSockets } from '../src/socket';

let serial = 0;
async function user(balance = 0) {
  return prisma.user.create({ data: { username: `regression_${++serial}`, wallet: { create: { balance } } } });
}
function token(id: string, role = 'USER', expired = false) {
  return jwt.sign({ userId: id, role }, config.jwtSecret, {
    audience: role === 'USER' ? config.userAudience : config.adminAudience, expiresIn: expired ? -1 : 900,
  });
}
async function run() {
  await initDbDefaults();
  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
  const app = express(); app.use(express.json()); app.use('/api', router);
  const server = http.createServer(app);
  const io = new Server(server);
  configureSockets(io);
  paymentService.setSocketServer(io); walletService.setSocketServer(io); gameManager.setSocketServer(io);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const sockets: Socket[] = [];
  async function request(endpoint: string, body?: unknown, bearer?: string, secret?: string) {
    const res = await fetch(origin + '/api' + endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(secret ? { 'x-webhook-secret': secret } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() as any };
  }
  let checks = 0;
  async function check(name: string, action: () => Promise<void>) { await action(); console.log(`PASS ${++checks}: ${name}`); }
  async function socket(bearer?: string, shouldConnect = true) {
    const client = connect(origin, { transports: ['websocket'], auth: bearer ? { token: bearer } : {}, reconnection: false });
    sockets.push(client);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 3000);
      client.once('connect', () => { clearTimeout(timer); shouldConnect ? resolve() : reject(new Error('Unauthenticated socket accepted')); });
      client.once('connect_error', () => { clearTimeout(timer); shouldConnect ? reject(new Error('Authenticated socket rejected')) : resolve(); });
    });
    return client;
  }
  try {
    await check('webhook requires a valid secret and UTR', async () => {
      const account = await user(); const dep = await paymentService.createDepositRequest(account.id, 501);
      for (const secret of [undefined, 'wrong-secret']) assert.equal((await request('/webhooks/upi-notify', { amount: dep.totalAmount, utr: 'AUTH_WEBHOOK_01' }, undefined, secret)).status, 401);
      assert.equal((await walletService.getWallet(account.id))!.balance, 0);
      const missingUtr = await request('/webhooks/upi-notify', { amount: dep.totalAmount }, undefined, config.webhookSecret);
      assert.notEqual(missingUtr.status, 200);
      assert.equal((await request('/webhooks/upi-notify', { amount: dep.totalAmount, utr: 'AUTH_WEBHOOK_01' }, undefined, config.webhookSecret)).data.success, true);
      assert.equal((await walletService.getWallet(account.id))!.balance, 501);
    });
    await check('financial endpoints reject anonymous access and ignore impersonated body IDs', async () => {
      const victim = await user(100); const actor = await user(80);
      for (const [endpoint, body] of [
        ['/withdrawals/request', { userId: victim.id, amount: 10, upiId: 'test@bank' }],
        ['/deposits/create', { userId: victim.id, amount: 10 }],
        ['/rooms/create', { userId: victim.id, entryFee: 10, maxPlayers: 2, guessNumber: 1 }],
        ['/rooms/join', { userId: victim.id, roomCode: 'any', guessNumber: 1 }],
      ] as const) assert.equal((await request(endpoint, body)).status, 401);
      const result = await request('/withdrawals/request', { userId: victim.id, amount: 10, upiId: 'test@bank' }, token(actor.id));
      assert.equal(result.data.withdrawal.userId, actor.id);
      assert.equal((await walletService.getWallet(victim.id))!.balance, 100);
      assert.equal((await request(`/wallet/${victim.id}`, undefined, token(actor.id))).status, 403);
      assert.equal((await request(`/withdrawals/user/${victim.id}`, undefined, token(actor.id))).status, 403);
      const dep = await paymentService.createDepositRequest(victim.id, 502);
      assert.equal((await request(`/deposits/status/${dep.depositId}`, undefined, token(actor.id))).status, 404);
      await prisma.user.update({ where: { id: actor.id }, data: { status: 'BANNED' } });
      assert.equal((await request('/deposits/create', { amount: 10 }, token(actor.id))).status, 403);
    });
    await check('small unmatched payments cannot approve larger deposits in either arrival order', async () => {
      const account = await user(); const dep = await paymentService.createDepositRequest(account.id, 10000);
      await paymentService.verifyIncomingPayment(1, 'SMALL_PAYMENT_01');
      await assert.rejects(paymentService.claimDepositUtr(account.id, dep.depositId, 'SMALL_PAYMENT_01'), /amount/);
      await paymentService.claimDepositUtr(account.id, dep.depositId, 'SMALL_PAYMENT_02');
      assert.equal((await paymentService.verifyIncomingPayment(2, 'SMALL_PAYMENT_02')).success, false);
      await assert.rejects(paymentService.adminApproveDeposit(dep.depositId, 'SMALL_PAYMENT_02', admin.id), /amount/);
      assert.equal((await walletService.getWallet(account.id))!.balance, 0);
    });
    await check('duplicate concurrent webhooks credit exactly once', async () => {
      const account = await user(); const dep = await paymentService.createDepositRequest(account.id, 600);
      const results = await Promise.all(Array.from({ length: 4 }, () => paymentService.verifyIncomingPayment(dep.totalAmount, 'DUPLICATE_PAYMENT')));
      assert(results.every(result => result.success));
      await assert.rejects(paymentService.verifyIncomingPayment(dep.totalAmount + 1, 'DUPLICATE_PAYMENT'), /different amount/);
      assert.equal((await walletService.getWallet(account.id))!.balance, 600);
      assert.equal(await prisma.transaction.count({ where: { referenceId: dep.depositId } }), 1);
      assert.equal(await prisma.unmatchedPayment.count({ where: { utr: 'DUPLICATE_PAYMENT' } }), 1);
    });
    await check('wallet failure rolls back approval and receipt, and retry succeeds', async () => {
      const account = await user(); const dep = await paymentService.createDepositRequest(account.id, 700);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_credit BEFORE UPDATE OF balance ON Wallet WHEN NEW.userId = '${account.id}' BEGIN SELECT RAISE(ABORT, 'simulated wallet failure'); END`);
      try { await assert.rejects(paymentService.verifyIncomingPayment(dep.totalAmount, 'ROLLBACK_PAYMENT')); }
      finally { await prisma.$executeRawUnsafe('DROP TRIGGER reject_credit'); }
      assert.equal((await prisma.deposit.findUniqueOrThrow({ where: { id: dep.depositId } })).status, 'PENDING');
      assert.equal(await prisma.transaction.count({ where: { referenceId: dep.depositId } }), 0);
      assert.equal(await prisma.unmatchedPayment.count({ where: { utr: 'ROLLBACK_PAYMENT' } }), 0);
      await paymentService.verifyIncomingPayment(dep.totalAmount, 'ROLLBACK_PAYMENT');
      assert.equal((await walletService.getWallet(account.id))!.balance, 700);
    });
    await check('claim, webhook and manual approval racing share one credit', async () => {
      const account = await user(); const dep = await paymentService.createDepositRequest(account.id, 701);
      const results = await Promise.allSettled([
        paymentService.verifyIncomingPayment(dep.totalAmount, 'ALL_PATHS_PAYMENT'),
        paymentService.claimDepositUtr(account.id, dep.depositId, 'ALL_PATHS_PAYMENT'),
        paymentService.adminApproveDeposit(dep.depositId, 'ALL_PATHS_PAYMENT', admin.id),
      ]);
      assert(results.some(r => r.status === 'fulfilled'));
      assert.equal((await walletService.getWallet(account.id))!.balance, 701);
      assert.equal(await prisma.transaction.count({ where: { referenceId: dep.depositId } }), 1);
    });
    await check('assigned unmatched UTR cannot be replayed or assigned twice', async () => {
      const account = await user(); const received = await paymentService.verifyIncomingPayment(702, 'UNMATCHED_ASSIGNMENT');
      assert('unmatchedPaymentId' in received);
      const unmatchedId = received.unmatchedPaymentId;
      assert(unmatchedId);
      await Promise.allSettled([
        paymentService.assignUnmatchedPayment(unmatchedId, account.id, admin.id),
        paymentService.assignUnmatchedPayment(unmatchedId, account.id, admin.id),
      ]);
      const dep = await paymentService.createDepositRequest(account.id, 703);
      await assert.rejects(paymentService.adminApproveDeposit(dep.depositId, 'UNMATCHED_ASSIGNMENT', admin.id));
      await paymentService.verifyIncomingPayment(702, 'UNMATCHED_ASSIGNMENT');
      assert.equal((await walletService.getWallet(account.id))!.balance, 702);
    });
    await check('expired amount slots can be reused, with late payments requiring UTR reconciliation', async () => {
      const account = await user();
      await prisma.deposit.createMany({ data: Array.from({ length: 99 }, (_, i) => ({
        userId: account.id, baseAmount: 800, offsetPaise: i + 1, totalAmount: 800 + (i + 1) / 100,
        receivingUpi: 'test@bank', status: 'EXPIRED', expiresAt: new Date(0),
      })) });
      const dep = await paymentService.createDepositRequest(account.id, 800);
      assert.equal((await paymentService.verifyIncomingPayment(dep.totalAmount, 'REUSED_AMOUNT_UTR')).success, false);
      await paymentService.claimDepositUtr(account.id, dep.depositId, 'REUSED_AMOUNT_UTR');
      assert.equal((await walletService.getWallet(account.id))!.balance, 800);
    });
    await check('parallel deposit creation reserves distinct active amounts', async () => {
      const users = await Promise.all([user(), user(), user()]);
      const deposits = await Promise.all(users.map(u => paymentService.createDepositRequest(u.id, 801)));
      assert.equal(new Set(deposits.map(d => d.totalAmount)).size, 3);
    });
    await check('rejected claims cannot be revived and duplicate unmatched notifications are idempotent', async () => {
      const account = await user(); const dep = await paymentService.createDepositRequest(account.id, 802);
      await paymentService.adminRejectDeposit(dep.depositId, 'Invalid claim', admin.id);
      await assert.rejects(paymentService.claimDepositUtr(account.id, dep.depositId, 'REJECTED_UTR'));
      await Promise.all([paymentService.verifyIncomingPayment(803, 'UNMATCHED_RETRY'), paymentService.verifyIncomingPayment(803, 'UNMATCHED_RETRY')]);
      assert.equal(await prisma.unmatchedPayment.count({ where: { utr: 'UNMATCHED_RETRY' } }), 1);
      await assert.rejects(paymentService.verifyIncomingPayment(804, 'UNMATCHED_RETRY'), /different amount/);
    });
    await check('invalid monetary inputs cannot change balances', async () => {
      const account = await user(100);
      for (const value of [NaN, Infinity, -10, 0, 10.001]) {
        await assert.rejects(paymentService.createDepositRequest(account.id, value));
        await assert.rejects(walletService.requestWithdrawal(account.id, value, 'test@bank'));
      }
      assert.equal((await request('/deposits/create', { amount: '100abc' }, token(account.id))).status, 400);
      assert.equal((await walletService.getWallet(account.id))!.balance, 100);
    });
    await check('fractional adjustments preserve paise exactly', async () => {
      const account = await user();
      for (let i = 0; i < 10; i++) await walletService.adjustBalance(account.id, 0.1, 'Precision test', admin.id);
      assert.equal((await walletService.getWallet(account.id))!.balance, 1);
      await walletService.adjustBalance(account.id, -1, 'Precision test', admin.id);
      assert.equal((await walletService.getWallet(account.id))!.balance, 0);
    });
    await check('concurrent withdrawal requests reserve funds only once', async () => {
      const account = await user(100);
      const results = await Promise.allSettled([walletService.requestWithdrawal(account.id, 80, 'test@bank'), walletService.requestWithdrawal(account.id, 80, 'test@bank')]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const wallet = (await walletService.getWallet(account.id))!;
      assert.equal(wallet.balance, 20); assert.equal(wallet.lockedBalance, 80);
      const withdrawal = await prisma.withdrawal.findFirstOrThrow({ where: { userId: account.id } });
      await Promise.allSettled([walletService.completeWithdrawal(withdrawal.id, 'PAYOUT_RACE_UTR'), walletService.rejectWithdrawal(withdrawal.id, 'Rejected')]);
      const after = (await walletService.getWallet(account.id))!;
      assert.equal(after.lockedBalance, 0);
      assert([20, 100].includes(after.balance));
    });
    await check('failed host entry leaves no room, and concurrent joins cannot overfill', async () => {
      const poor = await user(); const before = await prisma.room.count();
      await assert.rejects(gameManager.createRoom(poor.id, 10, 2, 1));
      assert.equal(await prisma.room.count(), before);
      const [host, a, b] = await Promise.all([user(100), user(100), user(100)]);
      const room = (await gameManager.createRoom(host.id, 10, 2, 1))!;
      const results = await Promise.allSettled([gameManager.joinRoom(a.id, room.roomCode, 2), gameManager.joinRoom(b.id, room.roomCode, 3)]);
      gameManager.stopTimers();
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal((await gameManager.getRoomDetails(room.id))!.players.length, 2);
    });
    await check('startup recovery refunds unfinished games exactly once', async () => {
      const [host, guest] = await Promise.all([user(100), user(100)]);
      const room = (await gameManager.createRoom(host.id, 10, 2, 1))!;
      await gameManager.joinRoom(guest.id, room.roomCode, 2); gameManager.stopTimers();
      await gameManager.recoverInterruptedRooms(); await gameManager.recoverInterruptedRooms();
      for (const account of [host, guest]) {
        const wallet = (await walletService.getWallet(account.id))!;
        assert.equal(wallet.balance, 100); assert.equal(wallet.lockedBalance, 0);
      }
      assert.equal((await gameManager.getRoomDetails(room.id))!.status, 'CANCELLED');
    });
    await check('only participants can cancel waiting rooms and receive one refund', async () => {
      const [host, outsider] = await Promise.all([user(100), user()]);
      const room = (await gameManager.createRoom(host.id, 10, 2, 1))!;
      assert.equal((await request(`/rooms/${room.id}/cancel`, {}, token(outsider.id))).status, 400);
      assert.equal((await request(`/rooms/${room.id}/cancel`, {}, token(host.id))).status, 200);
      await assert.rejects(gameManager.cancelWaitingRoom(room.id, host.id));
      assert.equal((await walletService.getWallet(host.id))!.balance, 100);
    });
    await check('settlement is once-only and stores the exact net payout', async () => {
      const [host, guest] = await Promise.all([user(100), user(100)]);
      const room = (await gameManager.createRoom(host.id, 10, 2, 1))!;
      await gameManager.joinRoom(guest.id, room.roomCode, 2); gameManager.stopTimers();
      await prisma.room.update({ where: { id: room.id }, data: { status: 'ROLLING' } });
      await walletService.settleRoomWinner(room.id, host.id, 1, 9999, 10);
      assert.equal((await gameManager.getRoomDetails(room.id))!.winnerPrize, 18);
      assert.equal((await walletService.getWallet(host.id))!.balance, 108);
      await assert.rejects(walletService.settleRoomWinner(room.id, host.id, 1, 20, 10));
      await gameManager.recoverInterruptedRooms();
      assert.equal((await walletService.getWallet(host.id))!.balance, 108);
    });
    await check('socket authentication and deposit ownership protect financial channels', async () => {
      await socket(undefined, false); const account = await user(); const other = await user();
      await socket(token(account.id, 'USER', true), false);
      const client = await socket(token(account.id)); const adminClient = await socket(token(admin.id, 'SUPER_ADMIN'));
      const dep = await paymentService.createDepositRequest(other.id, 805);
      client.emit('join_user_channel', other.id); client.emit('join_admin_channel');
      client.emit('join_room_channel', 'admin_channel'); client.emit('join_room_channel', `user:${other.id}`); client.emit('join_deposit_channel', dep.depositId);
      await new Promise(resolve => setTimeout(resolve, 100));
      const serverSocket = io.sockets.sockets.get(client.id!)!;
      assert(serverSocket.rooms.has(`user:${account.id}`));
      assert(!serverSocket.rooms.has(`user:${other.id}`));
      assert(!serverSocket.rooms.has('admin_channel'));
      assert(!serverSocket.rooms.has(`deposit:${dep.depositId}`));
      assert(io.sockets.sockets.get(adminClient.id!)!.rooms.has('admin_channel'));
      let leaked = false; client.on('admin_new_deposit', () => leaked = true);
      const delivered = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Admin event not delivered')), 2000);
        adminClient.once('admin_new_deposit', () => { clearTimeout(timer); resolve(); });
      });
      await paymentService.verifyIncomingPayment(dep.totalAmount, 'SOCKET_PAYMENT_UTR'); await delivered;
      assert.equal(leaked, false);
    });
    await check('mail delivery failures fail password reset and remove unusable OTPs', async () => {
      await assert.rejects(emailService.sendPasswordResetOtp('nobody@example.test', '123456', 'Test'), /unavailable/);
      const account = await user();
      await prisma.user.update({ where: { id: account.id }, data: { email: 'no-mail@example.test' } });
      await assert.rejects(authService.forgotPassword('no-mail@example.test'), /unavailable/);
      assert.equal(await prisma.passwordResetOtp.count({ where: { userId: account.id } }), 0);
    });
    console.log(`All ${checks} security/payment regression checks passed.`);
  } finally {
    gameManager.stopTimers(); sockets.forEach(client => client.disconnect());
    await new Promise<void>(resolve => io.close(() => resolve()));
    await prisma.$disconnect();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
