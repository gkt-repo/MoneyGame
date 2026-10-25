import './test-env';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import { tradingService as service } from '../src/modules/trading/trading.service';
import { normalizeEvent, TradingWorker } from '../src/modules/trading/feed';

async function main() {
  delete process.env.CRICTRADE_CASH_ENABLED; // Wallet conversion is the default.
  const notifications: { room: string; event: string; data: any }[] = [];
  service.setSocketServer({
    emit: () => {},
    to: (room: string) => ({ emit: (event: string, data: any) => notifications.push({ room, event, data }) }),
  } as any);
  const [a, b] = await Promise.all(
    ['cash-a', 'cash-b'].map((username) =>
      prisma.user.create({ data: { username, wallet: { create: { balance: 1000 } } } }),
    ),
  );
  const event = {
    id: 'wallet-live',
    name: 'India v NZ',
    status: 'in',
    summary: 'Live',
    period: 1,
    class: { eventType: 'T20' },
    competitors: [
      { name: 'India', score: '80/3 (10/20 ov)', winner: false },
      { name: 'NZ', score: '', winner: false },
    ],
  };
  // An existing free pool must retain its mode and must never contribute money.
  const legacy = await service.createSimulation();
  await service.fund(legacy, a.id, 100000, 'legacy-free-credit');
  const legacyId = `espn-${event.id}`;
  // Seed the old event identity without changing its accounts or mode.
  await prisma.tradingMarket.create({
    data: {
      id: legacyId,
      source: 'SIMULATION',
      title: event.name,
      team0: 'India',
      team1: 'NZ',
    },
  });
  await service.publish(legacyId, normalizeEvent(event)!);
  await service.fund(legacyId, a.id, 100000, 'old-live-free-credit');
  await prisma.tradingMarket.update({ where: { id: legacyId }, data: { source: 'ESPN' } });
  const feed = { sports: [{ leagues: [{ events: [event] }] }] };
  const worker = new TradingWorker(async () => feed);
  async function tick() {
    await prisma.tradingLease.updateMany({ data: { nextPollAt: new Date(0) } });
    await worker.tick();
  }
  await tick();
  const id = `espn-cash-${event.id}`;
  const markets = await service.listForUser(a.id);
  assert.deepEqual(
    markets.map((m) => m.id),
    [id],
  );
  assert.equal(markets[0].mode, 'CASH');
  assert.equal((await service.snapshot(legacyId, a.id)).market.mode, 'TEST');
  assert.equal((await service.snapshot(id, a.id)).walletAvailable, 100000);
  await assert.rejects(service.fund(legacyId, a.id, 1000, 'legacy-new-funding'), /Choose the live match/);
  const oldQuote = (await service.snapshot(legacyId, a.id)).market.quote!;
  await assert.rejects(
    service.trade(legacyId, a.id, {
      quoteId: oldQuote.id,
      requestId: 'legacy-new-buy',
      side: 'BUY',
      outcome: 0,
      quantity: 1,
    }),
    /Choose the live match/,
  );
  assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } })).balance, 1000);

  await Promise.all([
    service.fund(id, a.id, 25025, 'real-conversion-a'),
    service.fund(id, a.id, 25025, 'real-conversion-a'),
  ]);
  let wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } });
  assert.equal(wallet.balance, 749.75);
  assert.equal(wallet.lockedBalance, 250.25);
  assert(
    notifications.some(
      (n) =>
        n.room === `user:${a.id}` &&
        n.event === 'wallet_updated' &&
        n.data.balance === 749.75 &&
        n.data.lockedBalance === 250.25,
    ),
  );
  assert.equal((await service.snapshot(id, a.id)).account.balance, 25025, '₹250.25 buys 2,502.5 credits');
  assert.equal((await service.snapshot(id, a.id)).walletAvailable, 74975);
  assert.equal(
    await prisma.transaction.count({ where: { referenceId: id, userId: a.id, type: 'TRADING_FUND' } }),
    1,
  );
  await assert.rejects(
    service.fund(id, a.id, 75000, 'too-much-money'),
    (e: any) => e.code === 'INSUFFICIENT_WALLET_BALANCE',
  );
  assert.deepEqual(await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } }), wallet);
  const cashQuote = (await service.snapshot(id, a.id)).market.quote!;
  await service.fund(id, b.id, 25025, 'real-conversion-b');
  const order = {
    quoteId: cashQuote.id,
    requestId: 'cash-live-buy-a',
    side: 'BUY' as const,
    outcome: 0 as const,
    quantity: 10,
  };
  await service.trade(id, a.id, order);
  await service.trade(id, b.id, { ...order, requestId: 'cash-live-buy-b', outcome: 1 });
  process.env.CRICTRADE_CASH_ENABLED = 'false';
  await assert.rejects(service.fund(id, a.id, 100, 'cash-disabled-fund'), /entries are disabled/);
  await assert.rejects(
    service.trade(id, a.id, { ...order, requestId: 'cash-disabled-buy' }),
    /entries are disabled/,
  );
  await service.trade(id, a.id, { ...order, side: 'SELL', quantity: 1, requestId: 'cash-disabled-exit' });
  // Completed result still settles while new entries are disabled.
  event.status = 'post';
  event.summary = 'Result';
  event.competitors[0].winner = true;
  await tick();
  assert.equal((await service.snapshot(id, a.id)).account.receipt, null);
  await tick();
  const one = await service.snapshot(id, a.id),
    two = await service.snapshot(id, b.id);
  assert.equal(one.account.receipt!.mode, 'CASH');
  assert.equal(one.account.receipt!.payout + two.account.receipt!.payout, 50050);
  wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } });
  const other = await prisma.wallet.findUniqueOrThrow({ where: { userId: b.id } });
  assert.equal(Math.round((wallet.balance + other.balance) * 100), 200000);
  assert.equal(wallet.lockedBalance + other.lockedBalance, 0);
  assert(
    notifications.some(
      (n) =>
        n.room === `user:${b.id}` &&
        n.event === 'wallet_updated' &&
        n.data.balance === other.balance &&
        n.data.lockedBalance === 0,
    ),
  );
  assert.equal((await service.snapshot(legacyId, a.id)).account.receipt!.mode, 'TEST');
  assert.equal(await prisma.transaction.count({ where: { referenceId: legacyId } }), 0);
  await tick();
  assert.deepEqual(await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } }), wallet);
  assert.equal(await prisma.transaction.count({ where: { referenceId: id, type: 'TRADING_SETTLEMENT' } }), 2);
  delete process.env.CRICTRADE_CASH_ENABLED;

  // Two different matches cannot both spend the same wallet balance.
  const c = await prisma.user.create({
    data: { username: 'cash-race', wallet: { create: { balance: 10 } } },
  });
  const ids = ['cash-race-one', 'cash-race-two'];
  for (const matchId of ids) {
    await prisma.tradingMarket.create({
      data: { id: matchId, source: 'ESPN', mode: 'CASH', title: matchId, team0: 'India', team1: 'NZ' },
    });
    await service.publish(matchId, normalizeEvent(event)!);
  }
  const funded = await Promise.allSettled(
    ids.map((matchId, i) => service.fund(matchId, c.id, 1000, `race-funding-${i}`)),
  );
  assert.equal(funded.filter((r) => r.status === 'fulfilled').length, 1);
  const winningId = ids[funded.findIndex((r) => r.status === 'fulfilled')];
  assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: c.id } })).balance, 0);
  await service.settle(winningId, null, 'No result refund');
  await service.settle(winningId, null, 'Duplicate refund');
  const refunded = await prisma.wallet.findUniqueOrThrow({ where: { userId: c.id } });
  assert.equal(refunded.balance, 10);
  assert.equal(refunded.lockedBalance, 0);
  console.log(
    'PASS: live cash discovery, exact wallet conversion, insufficient funds, retry idempotency, legacy isolation, entry switch, exits, automatic payouts, pool conservation, concurrent funding and refunds.',
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
