import './test-env';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import { tradingService as service } from '../src/modules/trading/trading.service';
import {
  allocate,
  automaticCandleInterval,
  candles,
  entryClosed,
  parseScore,
  pollInterval,
  probability,
} from '../src/modules/trading/domain';
import { normalizeEvent, TradingWorker } from '../src/modules/trading/feed';
import { CricketState } from '@moneygame/shared-types';

const state: CricketState = {
  innings: 2,
  batting: 0,
  runs: 151,
  wickets: 5,
  balls: 108,
  totalBalls: 120,
  target: 181,
  description: 'test',
};
let quoteCounter = 1;
async function quote(id: string, p: number) {
  await service.publish(id, { ...state, runs: quoteCounter++, description: 'fixture' });
  const q = await prisma.tradingQuote.findFirstOrThrow({
    where: { marketId: id },
    orderBy: { sequence: 'desc' },
  });
  await prisma.tradingQuote.update({ where: { id: q.id }, data: { price0: p } });
  return q.id;
}
async function main() {
  const startupWorker = new TradingWorker(async () => ({ sports: [] }));
  await startupWorker.start();
  startupWorker.stop();
  assert.equal(await prisma.tradingMarket.count({ where: { source: 'SIMULATION' } }), 0,
    'Worker startup must not seed a simulation into an empty database');
  assert.equal(entryClosed(900), false, 'Exactly 90% permits entry');
  assert.equal(entryClosed(100), false, 'Exactly 90% for the other team permits entry');
  assert.equal(entryClosed(901), true);
  assert.equal(entryClosed(99), true);
  assert.equal(automaticCandleInterval({ ...state, balls: 101 }), 'over');
  assert.equal(automaticCandleInterval({ ...state, balls: 102 }), '1m');
  assert.equal(automaticCandleInterval({ ...state, innings: 1, balls: 102, target: null }), '1m');
  assert.equal(automaticCandleInterval({ ...state, balls: 120 }), '1m');
  assert.deepEqual(
    allocate([
      { id: 'a', deposit: 100000, balance: 120000 },
      { id: 'b', deposit: 100000, balance: 140000 },
      { id: 'c', deposit: 100000, balance: 70000 },
    ]).map((a) => a.payout),
    [110000, 120000, 70000],
  );
  let seed = 41;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let trial = 0; trial < 500; trial++) {
    const rows = Array.from({ length: 1 + (random() % 40) }, (_, i) => ({
      id: String(i).padStart(3, '0'),
      deposit: random() % 100000,
      balance: random() % 150000,
    }));
    const result = allocate(rows);
    assert.equal(
      result.reduce((n, a) => n + a.payout, 0),
      rows.reduce((n, a) => n + a.deposit, 0),
    );
    assert(result.every((a) => a.payout >= 0 && a.loss <= a.deposit));
    assert.deepEqual(result, allocate(rows));
  }
  assert.equal(allocate([{ id: 'a', deposit: 1000, balance: 800 }])[0].payout, 1000);
  assert.equal(allocate([{ id: 'a', deposit: 1000, balance: 1800 }])[0].reward, 0);
  assert.equal(parseScore('50/3 (6.6/20 ov)')!.balls, parseScore('50/3 (7/20 ov)')!.balls);
  assert.equal(parseScore('50/3 (7.8/20 ov)'), null);
  assert.equal(
    normalizeEvent({ period: 2, competitors: [{ score: '180/5 (20 ov)' }, { score: '151/5 (18/20 ov)' }] }),
    null,
  );
  assert.equal(pollInterval({ ...state, balls: 101 }), 60000);
  assert.equal(pollInterval({ ...state, balls: 102 }), 5000);
  assert.equal(pollInterval({ ...state, balls: 120 }), 60000);
  assert(probability({ ...state, runs: 157, balls: 109 }) > probability(state));
  assert(probability({ ...state, balls: 109 }) < probability(state));
  assert(probability({ ...state, wickets: 6, balls: 109 }) < probability(state));
  assert.equal(probability({ ...state, runs: 181 }), 1);
  assert.equal(probability({ ...state, balls: 120 }), 0);
  const cs = candles(
    [600, 650, 580, 620].map((price0, i) => ({
      price0,
      publishedAt: new Date(60000 + i * 1000),
      snapshot: JSON.stringify(state),
    })),
    0,
    '1m',
  );
  assert.deepEqual([cs[0].open, cs[0].high, cs[0].low, cs[0].close], [60, 65, 58, 62]);
  const a = await prisma.user.create({
    data: { username: 'trader-a', wallet: { create: { balance: 1000 } } },
  });
  const b = await prisma.user.create({
    data: { username: 'trader-b', wallet: { create: { balance: 1000 } } },
  });
  const market = await service.createSimulation();
  await Promise.all([
    service.fund(market, a.id, 100000, 'fund-a-001'),
    service.fund(market, a.id, 100000, 'fund-a-001'),
  ]);
  assert.equal((await service.snapshot(market, a.id)).account.deposit, 100000);
  await assert.rejects(service.fund(market, a.id, 200000, 'fund-a-001'), /already used/);
  await service.fund(market, b.id, 100000, 'fund-b-001');
  const buyQuote = await quote(market, 600);
  assert.deepEqual(await service.history(market, 0, 'auto'), await service.history(market, 0, '1m'));
  const buy = {
    requestId: 'buy-a-001',
    quoteId: buyQuote,
    side: 'BUY' as const,
    outcome: 0 as const,
    quantity: 100,
  };
  const [r1, r2] = await Promise.all([service.trade(market, a.id, buy), service.trade(market, a.id, buy)]);
  assert.equal(r1.executionId, r2.executionId);
  assert.equal((await service.snapshot(market, a.id)).account.balance, 40000);
  await assert.rejects(
    service.trade(market, b.id, { ...buy, side: 'SELL', requestId: 'sell-empty' }),
    /only sell/,
  );
  await service.trade(market, b.id, { ...buy, outcome: 1, requestId: 'buy-b-001' });
  const sellQuote = await quote(market, 800);
  await assert.rejects(service.trade(market, a.id, { ...buy, requestId: 'stale-buy' }), /Quote changed/);
  await service.trade(market, a.id, { ...buy, quoteId: sellQuote, side: 'SELL', requestId: 'sell-a-001' });
  assert.equal((await service.snapshot(market, a.id)).account.balance, 120000);
  assert.equal((await service.snapshot(market, a.id)).account.net, 20000);
  assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } })).balance, 1000);
  await service.pause(market, true, 'test pause', 'admin');
  await assert.rejects(
    service.trade(market, a.id, { ...buy, quoteId: sellQuote, requestId: 'paused-001' }),
    /paused/,
  );
  const runningMatch = await service.createSimulation();
  assert.equal(
    (await service.snapshot(runningMatch, a.id)).account.balance,
    0,
    'Credits from the first match are not available in another match',
  );
  await service.fund(runningMatch, a.id, 30000, 'fund-other-match');
  const runningBefore = await service.snapshot(runningMatch, a.id);
  await service.settle(market, 0, 'India win');
  const runningAfter = await service.snapshot(runningMatch, a.id);
  assert.deepEqual(
    runningAfter.account,
    runningBefore.account,
    'Settling one match leaves a running match account untouched',
  );
  assert.equal(runningAfter.market.status, 'OPEN');
  assert.equal(runningAfter.account.receipt, null);
  await service.settle(market, 0, 'Duplicate notification');
  const endA = (await service.snapshot(market, a.id)).account.receipt!;
  assert.equal(
    (await service.snapshot(market, a.id)).market.quote!.price0,
    1000,
    'Resolved team price reaches 100 credits',
  );
  assert.equal(
    (await service.history(market, 0, '1m')).at(-1)!.close,
    100,
    'The chart includes final settlement valuation',
  );
  const endB = (await service.snapshot(market, b.id)).account.receipt!;
  assert.equal(endA.payout, 140000);
  assert.equal(endB.payout, 60000);
  assert.equal(endA.payout + endB.payout, 200000);
  await assert.rejects(service.settle(market, 1, 'Changed winner'), /different result/);
  assert.equal(await prisma.transaction.count({ where: { referenceId: market } }), 0);
  assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } })).balance, 1000);
  const voided = await service.createSimulation();
  await service.fund(voided, a.id, 10000, 'fund-void');
  await service.settle(voided, null, 'Abandoned');
  assert.equal((await service.snapshot(voided, a.id)).account.receipt!.payout, 10000);
  // The cutoff uses the latest published price, independent of overs, and resumes
  // as soon as neither team exceeds 90%. It must not block recovery or valid exits.
  const cutoff = await service.createSimulation();
  await service.fund(cutoff, a.id, 10000, 'cutoff-initial-fund');
  const earlyOrder = {
    ...buy,
    quoteId: await quote(cutoff, 600),
    quantity: 2,
    requestId: 'cutoff-initial-buy',
  };
  await service.trade(cutoff, a.id, earlyOrder);
  const entryError = (e: any) => e.code === 'ENTRY_CLOSED' && e.status === 409;
  for (const rate of [900, 901, 100, 99, 500]) {
    const quoteId = await quote(cutoff, rate);
    const before = await service.snapshot(cutoff, a.id);
    const closed = rate > 900 || rate < 100;
    assert.equal(before.market.entryClosed, closed);
    assert.equal(before.market.status, 'OPEN', 'An entry cutoff does not pause exits');
    if (closed) {
      await service.fund(cutoff, a.id, 10000, 'cutoff-initial-fund');
      await service.trade(cutoff, a.id, earlyOrder);
      await assert.rejects(service.fund(cutoff, a.id, 1000, `cutoff-fund-${rate}`), entryError);
      await assert.rejects(service.fund(cutoff, b.id, 1000, `cutoff-new-${rate}`), entryError);
      for (const outcome of [0, 1] as const) {
        await assert.rejects(
          service.trade(cutoff, a.id, {
            ...earlyOrder,
            quoteId,
            outcome,
            requestId: `cutoff-buy-${rate}-${outcome}`,
          }),
          entryError,
        );
      }
      const after = await service.snapshot(cutoff, a.id);
      assert.deepEqual(
        after.account,
        before.account,
        'Rejected orders/retries cannot change credit balances',
      );
      assert.equal(after.executions.length, before.executions.length);
      assert.equal((await service.snapshot(cutoff, b.id)).account.deposit, 0);
      await service.trade(cutoff, a.id, {
        ...earlyOrder,
        quoteId,
        side: 'SELL',
        quantity: 1,
        requestId: `cutoff-exit-${rate}`,
      });
    } else {
      await service.fund(cutoff, a.id, 1000, `cutoff-fund-${rate}`);
      await service.trade(cutoff, a.id, {
        ...earlyOrder,
        quoteId,
        quantity: 1,
        requestId: `cutoff-buy-${rate}`,
      });
    }
  }
  const staleExitQuote = await quote(cutoff, 950);
  await prisma.tradingQuote.update({ where: { id: staleExitQuote }, data: { expiresAt: new Date(0) } });
  await assert.rejects(
    service.trade(cutoff, a.id, {
      ...earlyOrder,
      side: 'SELL',
      quantity: 1,
      quoteId: staleExitQuote,
      requestId: 'cutoff-stale-exit',
    }),
    /expired/,
  );
  await service.publish(cutoff, { ...state, runs: state.target! });
  await assert.rejects(
    service.trade(cutoff, a.id, { ...earlyOrder, side: 'SELL', quantity: 1, requestId: 'cutoff-ended-exit' }),
    /paused/,
  );
  const race = await service.createSimulation();
  await service.fund(race, a.id, 1000, 'fund-race');
  const rq = await quote(race, 600);
  const attempts = await Promise.allSettled(
    ['race-001', 'race-002'].map((requestId) =>
      service.trade(race, a.id, { requestId, quoteId: rq, quantity: 1, outcome: 0, side: 'BUY' }),
    ),
  );
  assert.equal(attempts.filter((a) => a.status === 'fulfilled').length, 1);
  const cash = await service.createSimulation();
  await prisma.tradingMarket.update({ where: { id: cash }, data: { mode: 'CASH' } });
  await assert.rejects(service.fund(cash, a.id, 1000, 'cash-test'), /verified feed/);
  const terminal = await service.createSimulation();
  await service.publish(terminal, { ...state, runs: 181 });
  assert.equal((await service.snapshot(terminal, a.id)).market.status, 'SUSPENDED');
  let requests = 0;
  const feed = {
    sports: [
      {
        leagues: [
          {
            events: [
              {
                id: 'fixture',
                name: 'India v NZ',
                status: 'in',
                summary: 'Live',
                period: 1,
                competitors: [
                  { name: 'India', score: '150/3 (17/20 ov)' },
                  { name: 'NZ', score: '' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const worker = new TradingWorker(async () => {
    requests++;
    return feed;
  });
  const originalLive = feed.sports[0].leagues[0].events[0];
  feed.sports[0].leagues[0].events.push({
    ...originalLive,
    id: 'old-result',
    status: 'post',
    summary: 'Result',
  });
  await worker.tick();
  assert.equal(
    await prisma.tradingMarket.count({ where: { id: 'espn-old-result' } }),
    0,
    'Completed feed events are not discovered as new trading matches',
  );
  assert.equal(requests, 1);
  await worker.tick();
  assert.equal(requests, 1, 'Poller reuses cached schedule');
  await new TradingWorker(async () => {
    requests++;
    return feed;
  }).tick();
  assert.equal(requests, 1, 'Only one process owns the shared poller');
  const lease = await prisma.tradingLease.findUniqueOrThrow({ where: { id: 'crictrade' } });
  assert(lease.nextPollAt.getTime() - Date.now() <= 5000, 'Final three overs select fast cadence');
  assert.equal((await service.snapshot('espn-fixture', a.id)).market.pollingMs, 5000);
  const espnQuote = await prisma.tradingQuote.findFirstOrThrow({ where: { marketId: 'espn-fixture' } });
  await service.publish('espn-fixture', JSON.parse(espnQuote.snapshot));
  assert.equal(
    (await prisma.tradingQuote.findFirstOrThrow({ where: { marketId: 'espn-fixture' } })).expiresAt.getTime(),
    espnQuote.expiresAt.getTime(),
    'Duplicate feed checks never renew executable quotes',
  );
  await service.publish('espn-fixture', { ...JSON.parse(espnQuote.snapshot), runs: 149 });
  assert.equal(
    (await service.snapshot('espn-fixture', a.id)).market.status,
    'SUSPENDED',
    'Score corrections require review',
  );
  assert.equal(
    await prisma.tradingQuote.count({ where: { marketId: 'espn-fixture' } }),
    1,
    'Unreviewed corrections do not publish a price',
  );
  await prisma.tradingLease.update({
    where: { id: 'crictrade' },
    data: { expiresAt: new Date(0), nextPollAt: new Date(0) },
  });
  const backoff = new TradingWorker(async () => {
    throw Object.assign(new Error('fixture rate limit'), { retryMs: 1800000 });
  });
  await backoff.tick();
  const retry = await prisma.tradingLease.findUniqueOrThrow({ where: { id: 'crictrade' } });
  assert(
    retry.nextPollAt.getTime() - Date.now() > 1799000,
    'Provider Retry-After is honored even when longer than normal backoff',
  );

  // Exercise the future cash ledger boundary only in this runner's isolated DB.
  const escrow = await service.createSimulation();
  await prisma.tradingMarket.update({
    where: { id: escrow },
    data: { source: 'VERIFIED', mode: 'CASH', modelVersion: 'test-approved-fixture' },
  });
  process.env.CRICTRADE_CASH_ENABLED = 'true';
  await service.fund(escrow, a.id, 100000, 'cash-fund-a');
  await service.fund(escrow, a.id, 100000, 'cash-fund-a');
  await service.fund(escrow, b.id, 100000, 'cash-fund-b');
  const eq = await quote(escrow, 600);
  await service.trade(escrow, a.id, { ...buy, quoteId: eq, requestId: 'cash-buy-a' });
  await service.trade(escrow, b.id, { ...buy, quoteId: eq, outcome: 1, requestId: 'cash-buy-b' });
  await quote(escrow, 901);
  const cashBeforeCutoff = await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } });
  await assert.rejects(service.fund(escrow, a.id, 1000, 'cash-cutoff-fund'), entryError);
  assert.deepEqual(await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } }), cashBeforeCutoff);
  assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } })).lockedBalance, 1000);
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER reject_trading_payout BEFORE UPDATE OF balance ON Wallet WHEN NEW.userId = '${b.id}' BEGIN SELECT RAISE(ABORT, 'fixture payout failure'); END`,
  );
  try {
    await assert.rejects(service.settle(escrow, 0, 'Rollback fixture'));
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER reject_trading_payout');
  }
  assert.equal(
    await prisma.tradingAccount.count({ where: { marketId: escrow, receipt: { not: null } } }),
    0,
    'Failed payout rolls back every receipt',
  );
  assert.equal(
    (await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } })).balance,
    0,
    'Failed settlement cannot partially credit users',
  );
  await service.settle(escrow, 0, 'Cash boundary fixture');
  await service.settle(escrow, 0, 'Duplicate cash result');
  const wa = await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } }),
    wb = await prisma.wallet.findUniqueOrThrow({ where: { userId: b.id } });
  assert.equal(wa.balance, 1400);
  assert.equal(wb.balance, 600);
  assert.equal(wa.lockedBalance + wb.lockedBalance, 0);
  assert.equal(
    await prisma.transaction.count({ where: { referenceId: escrow, type: 'TRADING_SETTLEMENT' } }),
    2,
  );
  delete process.env.CRICTRADE_CASH_ENABLED;
  console.log(
    'PASS: CricTrade conversion, 500 conservation cases, rounding, model/parse/candles, duplicate requests, concurrency, ownership, stale quotes, pause, settlement, refunds and test-wallet isolation.',
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
