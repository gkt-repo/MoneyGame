import './test-env';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/db';
import { config } from '../src/config';
import { tradingRouter, tradingAdminRouter } from '../src/routes/trading.routes';
import { tradingService } from '../src/modules/trading/trading.service';

async function main() {
  const app = express();
  app.use(express.json());
  app.use('/api/trading', tradingRouter);
  app.use('/api/admin/trading', tradingAdminRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}/api`;
  async function request(path: string, token?: string, body?: unknown) {
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as any };
  }
  const token = (id: string, role = 'USER') =>
    jwt.sign({ userId: id, role }, config.jwtSecret, {
      audience: role === 'USER' ? config.userAudience : config.adminAudience,
      expiresIn: 900,
    });
  try {
    const users = await Promise.all(
      ['USER', 'USER', 'ADMIN', 'MODERATOR'].map((role, i) =>
        prisma.user.create({
          data: { username: `http-trader-${i}`, role, wallet: { create: { balance: 1000 } } },
        }),
      ),
    );
    const [a, b, admin, moderator] = users;
    assert.equal((await request('/trading/markets')).status, 401);
    assert.equal((await request('/admin/trading/markets', token(a.id))).status, 401);
    assert.equal((await request('/admin/trading/markets', token(moderator.id, 'MODERATOR'))).status, 403);
    const created = await request('/admin/trading/simulation', token(admin.id, 'ADMIN'), {});
    assert.equal(created.status, 200);
    const id = created.body.id;
    const path = `/trading/markets/${id}`;
    assert.equal(
      (await request(path + '/fund', token(a.id), { amount: 10000, requestId: 'fund-http', userId: b.id }))
        .status,
      200,
    );
    assert.equal(
      (await request(path, token(b.id))).body.account.deposit,
      0,
      'Body user ID cannot impersonate another account',
    );
    const snapshot = (await request(path, token(a.id))).body;
    assert.equal(snapshot.account.deposit, 10000);
    const order = {
      requestId: 'order-http',
      quoteId: snapshot.market.quote.id,
      outcome: 0,
      side: 'BUY',
      quantity: 5,
    };
    assert.equal((await request(path + '/orders', token(a.id), order)).status, 200);
    assert.equal((await request(path + '/orders/order-http', token(a.id))).status, 200);
    assert.equal((await request(path + '/orders/order-http', token(b.id))).status, 404);
    assert.equal(
      (await request(path + '/orders', token(a.id), { ...order, requestId: 'bad-quantity', quantity: 0.5 }))
        .status,
      400,
    );
    assert.equal((await request(path + '/candles?interval=bad', token(a.id))).status, 400);
    const bars = await request(path + '/candles?outcome=1&interval=over', token(a.id));
    assert.equal(bars.status, 200);
    assert(bars.body.length > 0);
    const pausePath = `/admin/trading/markets/${id}/pause`;
    assert.equal(
      (await request(pausePath, token(admin.id, 'ADMIN'), { paused: true, reason: 'HTTP test pause' }))
        .status,
      200,
    );
    assert.equal(
      (await request(path + '/orders', token(a.id), { ...order, requestId: 'closed-http' })).status,
      409,
    );
    const settlePath = `/admin/trading/markets/${id}/settle`;
    assert.equal(
      (await request(settlePath, token(admin.id, 'ADMIN'), { winner: null, reason: 'Refund fixture' }))
        .status,
      200,
    );
    const settled = (await request(path, token(a.id))).body;
    assert.equal(settled.account.receipt.payout, 10000);
    assert.equal(settled.account.receipt.mode, 'TEST');
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } })).balance, 1000);
    await prisma.user.update({ where: { id: b.id }, data: { status: 'BANNED' } });
    assert.equal((await request('/trading/markets', token(b.id))).status, 403);
    const paused = await tradingService.snapshot(id, a.id);
    assert.equal(paused.market.status, 'VOIDED');
    console.log(
      'PASS: Trading HTTP authentication, roles, account isolation, validation, order recovery, candles, admin pause and settlement.',
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
