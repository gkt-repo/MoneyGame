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
    assert.equal(
      (await request('/trading/markets', token(a.id))).body.length,
      0,
      'Simulations are never advertised in the user picker',
    );
    assert(
      (await request('/admin/trading/markets', token(admin.id, 'ADMIN'))).body.some((m: any) => m.id === id),
    );
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
    assert.equal(snapshot.market.entryClosed, false);
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
    await prisma.tradingQuote.update({ where: { id: order.quoteId }, data: { price0: 901 } });
    assert.equal((await request(path, token(a.id))).body.market.entryClosed, true);
    const lateFund = await request(path + '/fund', token(a.id), {
      amount: 1000,
      requestId: 'late-http-fund',
    });
    assert.equal(lateFund.status, 409);
    assert.equal(lateFund.body.code, 'ENTRY_CLOSED');
    const lateBuy = await request(path + '/orders', token(a.id), { ...order, requestId: 'late-http-buy' });
    assert.equal(lateBuy.status, 409);
    assert.equal(lateBuy.body.code, 'ENTRY_CLOSED');
    assert.equal(
      (
        await request(path + '/orders', token(a.id), {
          ...order,
          side: 'SELL',
          quantity: 1,
          requestId: 'late-http-exit',
        })
      ).status,
      200,
    );
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
    const fixtures: Record<string, string> = {};
    for (const kind of ['live', 'stale', 'expired', 'paused', 'settled']) {
      const marketId = await tradingService.createSimulation();
      fixtures[kind] = marketId;
      await prisma.tradingMarket.update({
        where: { id: marketId },
        data: {
          source: 'ESPN',
          ...(kind === 'stale' ? { feedReceivedAt: new Date(0) } : {}),
          ...(kind === 'paused' ? { status: 'SUSPENDED' } : {}),
          ...(kind === 'settled' ? { status: 'SETTLED' } : {}),
        },
      });
      if (kind === 'expired')
        await prisma.tradingQuote.updateMany({ where: { marketId }, data: { expiresAt: new Date(0) } });
    }
    const liveList = (await request('/trading/markets', token(a.id))).body;
    assert.deepEqual(
      liveList.map((m: any) => m.id),
      [fixtures.live],
    );
    assert.equal(liveList[0].mode, 'TEST', 'Real-feed markets remain test-credit markets');
    await tradingService.fund(fixtures.live, a.id, 1000, 'fund-live-fixture');
    await tradingService.settle(fixtures.live, null, 'Live fixture ended');
    assert.equal((await request('/trading/markets', token(a.id))).body.length, 0);
    const history = (await request('/trading/markets?view=positions', token(a.id))).body;
    assert.deepEqual(
      history.map((m: any) => m.id),
      [fixtures.live],
      'Own finished real matches remain accessible',
    );
    assert.equal(
      (await request('/trading/markets?view=positions', token(b.id))).body.length,
      0,
      'Position history is scoped to the authenticated user',
    );
    const testId = 'http-test-match';
    await prisma.tradingMarket.create({
      data: {
        id: testId,
        source: 'ESPN',
        title: 'Test fixture',
        team0: 'India',
        team1: 'NZ',
      },
    });
    await tradingService.publish(testId, {
      format: 'TEST',
      innings: 3,
      batting: 1,
      runs: 92,
      wickets: 2,
      balls: 175,
      totalBalls: null,
      target: null,
      teamRuns: [317, 205],
      inningsPlayed: [1, 2],
      day: 2,
      scheduledDays: 4,
      session: 3,
      description: 'Test HTTP fixture',
    });
    const testPath = `/trading/markets/${testId}`;
    assert.equal(
      (
        await request(testPath + '/fund', token(a.id), {
          amount: 10000,
          requestId: 'http-draw-fund',
        })
      ).status,
      200,
    );
    const testQuote = (await request(testPath, token(a.id))).body.market.quote;
    assert(testQuote.priceDraw > 0);
    const drawOrder = {
      requestId: 'http-draw-buy',
      quoteId: testQuote.id,
      outcome: 2,
      side: 'BUY',
      quantity: 5,
    };
    assert.equal((await request(testPath + '/orders', token(a.id), drawOrder)).status, 200);
    const drawBars = await request(testPath + '/candles?outcome=2&interval=auto', token(a.id));
    assert.equal(drawBars.status, 200);
    assert.equal(drawBars.body[0].close, testQuote.priceDraw / 10);
    assert.equal(
      (
        await request(testPath + '/orders', token(a.id), {
          ...drawOrder,
          requestId: 'http-draw-exit',
          side: 'SELL',
          quantity: 1,
        })
      ).status,
      200,
    );
    const drawSettlement = `/admin/trading/markets/${testId}/settle`;
    assert.equal(
      (
        await request(drawSettlement, token(a.id), {
          winner: 2,
          reason: 'Unauthorized draw',
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(drawSettlement, token(admin.id, 'ADMIN'), {
          winner: 2,
          reason: 'Confirmed Test draw',
        })
      ).status,
      200,
    );
    const drawn = (await request(testPath, token(a.id))).body;
    assert.equal(drawn.market.winner, 2);
    assert.equal(drawn.market.status, 'SETTLED');
    assert.equal(drawn.market.quote.priceDraw, 1000);
    assert.equal(drawn.account.receipt.payout, 10000, 'No loss pool means no extra payout');
    await prisma.user.update({
      where: { id: b.id },
      data: { status: 'BANNED' },
    });
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
