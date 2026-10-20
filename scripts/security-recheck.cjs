// Isolated follow-up diagnostics. Does not contact the deployed application.
// Each scenario records evidence; an unexpected exception makes the run fail.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const server = path.join(root, 'apps/server');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moneygame-recheck-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: `file:${dir}/test.db`,
  JWT_SECRET: 'isolated-review-jwt-secret-not-for-deployment',
  WEBHOOK_SECRET: 'isolated-review-webhook-secret-not-for-deployment',
  PLATFORM_COMMISSION_PERCENT: '0', TS_NODE_PROJECT: path.join(server, 'tsconfig.json'),
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
});
fs.writeFileSync(path.join(dir, 'test.db'), '');
const setup = spawnSync(process.execPath,
  [require.resolve(`${root}/node_modules/prisma`), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
  { cwd: server, env: process.env, encoding: 'utf8' });
if (setup.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); throw new Error(setup.stderr); }
require(`${root}/node_modules/ts-node/register/transpile-only`);
const { prisma } = require(`${server}/src/db`);
const { gameManager } = require(`${server}/src/modules/game/game.manager`);
const { teenPattiEngine: engine } = require(`${server}/src/modules/game/engines/teen-patti/teen-patti.engine`);
const { walletService } = require(`${server}/src/modules/wallet/wallet.service`);
const { paymentService } = require(`${server}/src/modules/payment/payment.service`);
const { adminService } = require(`${server}/src/modules/admin/admin.service`);
const { authService } = require(`${server}/src/modules/auth/auth.service`);
const { router } = require(`${server}/src/routes/api.routes`);
const { config } = require(`${server}/src/config`);
const bcrypt = require(`${root}/node_modules/bcryptjs`);
const jwt = require(`${root}/node_modules/jsonwebtoken`);
let counter = 0;
const observations = [];
async function user(balance = 100) {
  const n = ++counter;
  return prisma.user.create({ data: { username: `recheck-${n}`, email: `recheck-${n}@example.test`,
    phone: String(8000000000 + n), passwordHash: 'not-a-login-hash', wallet: { create: { balance } } } });
}
async function game(count = 2) {
  const users = await Promise.all(Array.from({ length: count }, () => user()));
  const room = await gameManager.createRoom(users[0].id, 10, count, null, 'TEEN_PATTI');
  for (const u of users.slice(1)) await gameManager.joinRoom(u.id, room.roomCode);
  for (let i = 0; i < 200 && !engine.getClientState(room.id); i++) await new Promise(r => setTimeout(r, 5));
  assert(engine.getClientState(room.id), 'Game did not start');
  return { users, room };
}
async function rejection(fn) {
  try { await fn(); return null; } catch (error) { return error.message; }
}
async function route(routePath, req) {
  const layer = router.stack.find(l => l.route?.path === routePath);
  assert(layer, `Missing route ${routePath}`);
  const result = { status: 200 };
  const res = { status(s) { result.status = s; return this; }, json(body) { result.body = body; return this; } };
  // Invoke the terminal handler; authorization being tested is inside this handler.
  await layer.route.stack.at(-1).handle(req, res);
  return result;
}
async function observe(name, fn) {
  try { observations.push({ name, ...await fn() }); }
  catch (error) { observations.push({ name, unexpectedError: error.message }); process.exitCode = 1; }
}
function captureIo(events) {
  return { to(channel) { return { emit(event, payload) { events.push({ channel, event, payload }); } }; }, emit() {} };
}
(async () => {
  await observe('01 negative and sub-minimum stakes', async () => {
    const { users: [a], room } = await game();
    const negative = await engine.handleAction(room.id, a.id, 'BLIND', { amount: -10 }, null);
    const low = await engine.handleAction(room.id, a.id, 'BLIND', { amount: 0.001 }, null);
    return { negativeAccepted: negative.success, tinyAccepted: low.success, wallet: await walletService.getWallet(a.id) };
  });
  await observe('03 forged token cards', async () => {
    const { users: [a], room } = await game();
    await engine.handleAction(room.id, a.id, 'SEE_CARDS', {}, null);
    const forged = Buffer.from('{"alg":"none"}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ userId: a.id })).toString('base64url') + '.';
    const r = await route('/rooms/:roomId', { params: { roomId: room.id }, headers: { authorization: `Bearer ${forged}` } });
    return { status: r.status, exposedCards: r.body.room.gameState.players[a.id].cards?.length || 0 };
  });
  await observe('05 concurrent betting', async () => {
    const { users: [a, b], room } = await game();
    const actions = await Promise.all([engine.handleAction(room.id, a.id, 'BLIND', {}, null), engine.handleAction(room.id, a.id, 'BLIND', {}, null)]);
    return { accepted: actions.map(r => r.success), opponentTurn: engine.getClientState(room.id).currentTurnUserId === b.id };
  });
  await observe('06 valid new stakes survive recovery', async () => {
    const { users: [a], room } = await game();
    assert((await engine.handleAction(room.id, a.id, 'BLIND', { multiplier: 2 }, null)).success);
    engine.cleanupRoom(room.id);
    await gameManager.recoverInterruptedRooms();
    const w = await walletService.getWallet(a.id);
    return { balance: w.balance, lockedBalance: w.lockedBalance, status: (await prisma.room.findUnique({ where: { id: room.id } })).status };
  });
  await observe('07 failure remains stuck after DB recovers', async () => {
    const { users: [a, b], room } = await game();
    const original = walletService.settleRoomWinner;
    walletService.settleRoomWinner = async () => { throw new Error('injected database interruption'); };
    let failed;
    try { failed = await engine.handleAction(room.id, a.id, 'PACK', {}, null); }
    finally { walletService.settleRoomWinner = original; }
    const retry = await engine.handleAction(room.id, b.id, 'PACK', {}, null);
    return { failedActionSuccess: failed.success, retry, memoryStatus: engine.games.get(room.id).status };
  });
  await observe('08 disabled and unknown games', async () => {
    const a = await user();
    return { disabledError: await rejection(() => gameManager.createRoom(a.id, 10, 4, null, 'TWENTY_NINE')),
      unknownError: await rejection(() => gameManager.createRoom(a.id, 10, 2, 1, 'INVALID')) };
  });
  await observe('09 banned socket action', async () => {
    const { configureSockets } = require(`${server}/src/socket`);
    const { users: [a], room } = await game();
    let middleware, connection, disconnected = false;
    configureSockets({ use(fn) { middleware = fn; }, on(e, fn) { connection = fn; } });
    const handlers = {}, emitted = [];
    const socket = { handshake: { auth: { token: jwt.sign({ userId: a.id, role: 'USER' }, config.jwtSecret, { audience: config.userAudience, expiresIn: '15m' }) } },
      data: {}, connected: true, join() {}, on(e, fn) { handlers[e] = fn; }, emit(e, p) { emitted.push({ e, p }); }, disconnect() { disconnected = true; } };
    await middleware(socket, error => { if (error) throw error; });
    connection(socket);
    try {
      await prisma.user.update({ where: { id: a.id }, data: { status: 'BANNED' } });
      await handlers.game_action({ roomId: room.id, action: 'BLIND', payload: {} });
      return { response: emitted.find(e => e.e === 'game_action_response').p, disconnected };
    } finally { handlers.disconnect(); }
  });
  await observe('10 banned admin webhook', async () => {
    const a = await user();
    await prisma.user.update({ where: { id: a.id }, data: { role: 'ADMIN', status: 'BANNED' } });
    const token = jwt.sign({ userId: a.id, role: 'ADMIN' }, config.jwtSecret, { audience: config.adminAudience, expiresIn: '15m' });
    return route('/webhooks/upi-notify', { headers: { authorization: `Bearer ${token}` }, body: { amount: 12, utr: 'RECHECKBANNED123' } });
  });
  await observe('09 banned admin retains socket subscription authority', async () => {
    const { configureSockets } = require(`${server}/src/socket`);
    const a = await user();
    await prisma.user.update({ where: { id: a.id }, data: { role: 'ADMIN' } });
    let middleware, connection;
    configureSockets({ use(fn) { middleware = fn; }, on(e, fn) { connection = fn; } });
    const handlers = {}, joins = [];
    const socket = {
      handshake: { auth: { token: jwt.sign({ userId: a.id, role: 'ADMIN' }, config.jwtSecret, { audience: config.adminAudience, expiresIn: '15m' }) } },
      data: {}, join(channel) { joins.push(channel); }, on(e, fn) { handlers[e] = fn; },
    };
    await middleware(socket, error => { if (error) throw error; });
    connection(socket);
    try {
      await prisma.user.update({ where: { id: a.id }, data: { status: 'BANNED' } });
      joins.length = 0;
      await handlers.join_admin_channel();
      return { joinedAdminChannelAfterBan: joins.includes('admin_channel'), cachedAdminPrivilege: socket.data.admin };
    } finally { handlers.disconnect?.(); }
  });
  await observe('11 simultaneous OTP reset', async () => {
    const a = await user();
    await prisma.passwordResetOtp.create({ data: { userId: a.id, otpHash: await bcrypt.hash('123456', 10), expiresAt: new Date(Date.now() + 60000) } });
    const r = await Promise.allSettled([authService.resetPassword(a.email, '123456', 'password-one'), authService.resetPassword(a.email, '123456', 'password-two')]);
    return { outcomes: r.map(x => x.status) };
  });
  await observe('12 older OTP invalidation and 21 phone recovery', async () => {
    const a = await user();
    for (const otp of ['111111', '222222']) await prisma.passwordResetOtp.create({ data: { userId: a.id, otpHash: await bcrypt.hash(otp, 10), expiresAt: new Date(Date.now() + 60000) } });
    const phoneReset = await authService.resetPassword(a.phone, '222222', 'phone-reset-password');
    return { phoneReset: phoneReset.success, olderOtpError: await rejection(() => authService.resetPassword(a.email, '111111', 'older-password')) };
  });
  await observe('13 admin hierarchy and 14 funded deletion', async () => {
    const a = await user(), s = await user();
    await prisma.user.update({ where: { id: a.id }, data: { role: 'ADMIN' } });
    await prisma.user.update({ where: { id: s.id }, data: { role: 'SUPER_ADMIN' } });
    return { banError: await rejection(() => adminService.updateUserStatus(s.id, 'BANNED', a.id)), fundedDeleteError: await rejection(() => adminService.deleteUser(a.id)) };
  });
  await observe('14 deletion raced by a committed payment', async () => {
    const a = await user(0);
    const original = prisma.user.delete;
    let creditedBeforeDelete = 0;
    // Deterministically schedule a legitimate payment after guards, before DELETE.
    prisma.user.delete = async args => {
      const d = await paymentService.createDepositRequest(a.id, 77);
      await paymentService.verifyIncomingPayment(d.totalAmount, 'RECHECKDELETERACE');
      creditedBeforeDelete = (await walletService.getWallet(a.id)).balance;
      return original.call(prisma.user, args);
    };
    try { await adminService.deleteUser(a.id); }
    finally { prisma.user.delete = original; }
    return { creditedBeforeDelete, remainingWallet: await walletService.getWallet(a.id), remainingDeposits: await prisma.deposit.count({ where: { userId: a.id } }) };
  });
  await observe('16 fold ordering and 17 seat validation', async () => {
    const { users: [a, b, c], room } = await game(3);
    await engine.handleAction(room.id, a.id, 'BLIND', {}, null);
    await engine.handleAction(room.id, b.id, 'PACK', {}, null);
    const x = await user(), y = await user();
    const waiting = await gameManager.createRoom(x.id, 10, 3, null, 'TEEN_PATTI');
    return { correctNextSeat: engine.getClientState(room.id).currentTurnUserId === c.id, negativeSeatError: await rejection(() => gameManager.joinRoom(y.id, waiting.roomCode, null, -5)) };
  });
  await observe('18 initial private event missing room ID', async () => {
    const events = [];
    gameManager.setSocketServer(captureIo(events));
    try {
      await game();
      const initial = events.filter(x => x.event === 'teen_patti_state');
      return { initialPrivateEvents: initial.length, missingRoomId: initial.filter(x => !x.payload.roomId).length };
    } finally { gameManager.setSocketServer(null); }
  });
  await observe('24 new settlement commission records', async () => {
    const { users: [a, b], room } = await game();
    const previous = config.platformCommissionPercent;
    config.platformCommissionPercent = 10;
    try {
      await engine.handleAction(room.id, a.id, 'BLIND', {}, null);
      await engine.handleAction(room.id, b.id, 'PACK', {}, null);
      const r = await prisma.room.findUnique({ where: { id: room.id } });
      const cfg = JSON.parse(r.customConfig);
      return { actualPot: cfg.settledPool, actualCommission: cfg.platformCommission, prize: r.winnerPrize };
    } finally { config.platformCommissionPercent = previous; }
  });
  await observe('27 access token survives password reset', async () => {
    const { authenticateUser } = require(`${server}/src/middleware/auth.middleware`);
    const a = await user();
    const token = jwt.sign({ userId: a.id, role: 'USER' }, config.jwtSecret, { audience: config.userAudience, expiresIn: '15m' });
    await prisma.passwordResetOtp.create({ data: { userId: a.id, otpHash: await bcrypt.hash('123456', 10), expiresAt: new Date(Date.now() + 60000) } });
    await authService.resetPassword(a.email, '123456', 'new-password');
    let accepted = false;
    await authenticateUser({ headers: { authorization: `Bearer ${token}` } }, { status() { return this; }, json() {} }, () => { accepted = true; });
    return { oldAccessTokenAccepted: accepted };
  });
  await observe('29 customConfig has inconsistent detail/list shapes', async () => {
    const a = await user();
    const r = await gameManager.createRoom(a.id, 10, 2, 1, 'GUESS_NUMBER', { label: 'test' });
    const listed = (await gameManager.getActiveRooms()).find(x => x.id === r.id);
    return { detailsType: typeof r.customConfig, listType: typeof listed.customConfig };
  });
  await observe('32 in-flight action re-arms timer after stop', async () => {
    const { users: [a], room } = await game();
    const original = walletService.lockGameBet;
    let enter, release;
    const entered = new Promise(r => { enter = r; });
    const blocked = new Promise(r => { release = r; });
    walletService.lockGameBet = async (...args) => { enter(); await blocked; return original.apply(walletService, args); };
    try {
      const pending = engine.handleAction(room.id, a.id, 'BLIND', {}, null);
      await entered;
      gameManager.stopTimers();
      release();
      await pending;
      return { timerActiveAfterStop: !!engine.games.get(room.id).turnTimer };
    } finally { walletService.lockGameBet = original; }
  });
  await observe('33 default admin queue hides old pending requests', async () => {
    const a = await user();
    const old = await prisma.withdrawal.create({ data: { userId: a.id, amount: 10, upiId: 'review@bank', createdAt: new Date(0) } });
    await prisma.withdrawal.createMany({ data: Array.from({ length: 50 }, () => ({ userId: a.id, amount: 10, upiId: 'review@bank', status: 'REJECTED' })) });
    const defaults = await adminService.getWithdrawalsList();
    const filtered = await adminService.getWithdrawalsList('PENDING');
    return { defaultIncludesOld: defaults.some(x => x.id === old.id), filteredIncludesOld: filtered.some(x => x.id === old.id) };
  });
  await observe('N1 client configuration releases a withdrawal reservation', async () => {
    const a = await user();
    const w = await walletService.requestWithdrawal(a.id, 80, 'review@bank');
    const room = await gameManager.createRoom(a.id, 10, 2, null, 'TEEN_PATTI', { playerStakes: { [a.id]: 80 } });
    await gameManager.cancelWaitingRoom(room.id, a.id);
    const wallet = await walletService.getWallet(a.id);
    return { balance: wallet.balance, lockedBalance: wallet.lockedBalance, withdrawalStatus: (await prisma.withdrawal.findUnique({ where: { id: w.withdrawal.id } })).status,
      rejectError: await rejection(() => walletService.rejectWithdrawal(w.withdrawal.id, 'test')) };
  });
  await observe('N2 anonymous heartbeat writes trusted telemetry', async () => {
    const r = await route('/webhooks/listener-heartbeat', { headers: {}, body: { phoneModel: 'UNAUTHENTICATED-RECHECK' } });
    return { ...r, storedMetadata: (await prisma.systemSetting.findUnique({ where: { key: 'listener_metadata' } }))?.value || null };
  });
  await observe('04 HTTP listener URL still returned', async () => {
    const previous = process.env.PUBLIC_API_URL;
    delete process.env.PUBLIC_API_URL;
    try {
      const r = await route('/admin/listener-config', { headers: {}, protocol: 'http', get: () => 'review.example.test:4000' });
      return { status: r.status, listenerUrl: r.body.serverUrl }; // Never print returned secret.
    } finally { if (previous === undefined) delete process.env.PUBLIC_API_URL; else process.env.PUBLIC_API_URL = previous; }
  });
  await observe('N3 production trust proxy accepts spoofed IP', async () => {
    const configPath = require.resolve(`${server}/src/config`);
    const oldNodeEnv = process.env.NODE_ENV, oldTrust = process.env.TRUST_PROXY;
    delete process.env.TRUST_PROXY; process.env.NODE_ENV = 'production'; delete require.cache[configPath];
    let productionConfig;
    try { productionConfig = require(configPath).config; }
    finally { process.env.NODE_ENV = oldNodeEnv; if (oldTrust === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = oldTrust; }
    const express = require(`${root}/node_modules/express`);
    const app = express(); app.set('trust proxy', productionConfig.trustProxy);
    const req = Object.create(express.request);
    req.app = app; req.socket = { remoteAddress: '198.51.100.20' }; req.headers = { 'x-forwarded-for': '203.0.113.44' };
    return { productionTrustProxy: productionConfig.trustProxy, actualPeer: req.socket.remoteAddress, limiterIp: req.ip };
  });
  await observe('N5 cancelled card room creates false passbook profit', async () => {
    const a = await user();
    const room = await gameManager.createRoom(a.id, 10, 2, null, 'TEEN_PATTI');
    await gameManager.cancelWaitingRoom(room.id, a.id);
    const txs = await prisma.transaction.findMany({ where: { userId: a.id } });
    return { actualBalanceChange: (await walletService.getWallet(a.id)).balance - 100, passbookNetChange: txs.reduce((s, t) => s + t.amount, 0), records: txs.map(t => ({ type: t.type, amount: t.amount })) };
  });
  await observe('N6 action queue remains allocated after no-game rejection', async () => {
    const a = await user();
    const r = await gameManager.createRoom(a.id, 10, 2, null, 'TEEN_PATTI');
    await gameManager.cancelWaitingRoom(r.id, a.id);
    await engine.handleAction(r.id, a.id, 'BLIND', {}, null);
    return { gameExists: engine.games.has(r.id), queueRetained: engine.actionQueues.has(r.id) };
  });
  await observe('N1 poisoned room repeatedly prevents startup recovery', async () => {
    // Run last: deliberately leaves an unrefundable room only in this temporary DB.
    await gameManager.recoverInterruptedRooms();
    const a = await user();
    const r = await gameManager.createRoom(a.id, 10, 2, null, 'TEEN_PATTI', { playerStakes: { [a.id]: 999999 } });
    const first = await rejection(() => gameManager.recoverInterruptedRooms());
    const second = await rejection(() => gameManager.recoverInterruptedRooms());
    return { first, second, status: (await prisma.room.findUnique({ where: { id: r.id } })).status };
  });
  console.log(JSON.stringify(observations, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  gameManager.stopTimers();
  await prisma.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(process.exitCode || 0); // Completed-game retention timers are irrelevant to these diagnostics.
});
