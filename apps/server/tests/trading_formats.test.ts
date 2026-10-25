import './test-env';
import assert from 'node:assert/strict';
import { CricketState } from '@moneygame/shared-types';
import { prisma } from '../src/db';
import { tradingService as service } from '../src/modules/trading/trading.service';
import { normalizeEvent, confirmedResult, TradingWorker } from '../src/modules/trading/feed';
import {
  automaticCandleInterval,
  entryClosed,
  formatOf,
  inningsEnded,
  MULTIFORMAT_MODEL,
  outcomePrice,
  pollInterval,
  prices,
  probabilities,
  validateState,
} from '../src/modules/trading/domain';

const event = {
  id: 'test-format-fixture',
  name: 'New Zealand A v India A',
  status: 'in',
  summary: 'Live',
  period: 3,
  class: { eventType: 'Test', generalClassCard: 'First-class' },
  fullStatus: {
    battingTeamId: 20,
    dayNumber: 2,
    session: 'Day 2 Session 3',
    longSummary: 'India A trail by 112 runs',
  },
  notes: [{ type: 'matchdays', text: '24,25,26,27 October 2026 (4-day match)' }],
  competitors: [
    { id: 10, name: 'New Zealand A', score: '317', winner: false },
    { id: 20, name: 'India A', score: '113 & 92/2 (29.1 ov)', winner: false },
  ],
};
const clone = () => structuredClone(event);
async function create(id: string, state: CricketState) {
  await prisma.tradingMarket.create({
    data: {
      id,
      source: 'ESPN',
      mode: 'CASH',
      title: id,
      team0: 'New Zealand A',
      team1: 'India A',
    },
  });
  await service.publish(id, state);
}
async function main() {
  const test = normalizeEvent(event)!;
  assert(test);
  assert.equal(test.format, 'TEST');
  assert.equal(test.totalBalls, null);
  assert.equal(test.batting, 1);
  assert.deepEqual(test.teamRuns, [317, 205]);
  assert.deepEqual(test.inningsPlayed, [1, 2]);
  assert.equal(test.balls, 175);
  assert.equal(automaticCandleInterval(test), 'over');
  assert.equal(pollInterval(test), 60000);

  const followOn = clone();
  followOn.competitors[0].score = '500/8d';
  followOn.competitors[1].score = '200 & 50/1 (20 ov)';
  assert.deepEqual(normalizeEvent(followOn)!.teamRuns, [500, 250]);
  assert.equal(normalizeEvent(followOn)!.batting, 1, 'Follow-on order comes from provider identity');
  const fourth = clone();
  fourth.period = 4;
  fourth.competitors[0].score = '300 & 200';
  fourth.competitors[1].score = '250 & 100/2 (30 ov, target 251)';
  const chase = normalizeEvent(fourth)!;
  assert.equal(chase.target, 251);
  fourth.competitors[1].score = '250 & 100/2 (30 ov, target 252)';
  assert.equal(normalizeEvent(fourth), null, 'Contradictory target is rejected');
  const declaration = clone();
  declaration.period = 1;
  declaration.competitors[0].score = '';
  declaration.competitors[1].score = '300/6d (90 ov)';
  assert(inningsEnded(normalizeEvent(declaration)!));
  const missingBatting = clone();
  missingBatting.fullStatus.battingTeamId = 0;
  assert.equal(normalizeEvent(missingBatting), null);
  const missingSession = clone();
  missingSession.fullStatus.session = 'Day 2';
  assert.equal(normalizeEvent(missingSession), null, 'Draw pricing requires source time context');
  const oddInnings = clone();
  oddInnings.period = 4;
  assert.equal(normalizeEvent(oddInnings), null);

  const odiEvent = {
    period: 2,
    class: { eventType: 'ODI' },
    competitors: [
      { name: 'India', score: '280/5 (49/50 ov, target 301)' },
      { name: 'NZ', score: '300/7' },
    ],
  };
  const odi = normalizeEvent(odiEvent)!;
  assert.equal(formatOf(odi), 'ODI');
  assert.equal(odi.totalBalls, 300);
  assert.equal(automaticCandleInterval(odi), 'over');
  assert.equal(pollInterval(odi), 60000);
  const t20: CricketState = {
    innings: 2,
    batting: 0,
    runs: 151,
    wickets: 5,
    balls: 108,
    totalBalls: 120,
    target: 181,
    description: 'Legacy T20',
  };
  assert.equal(formatOf(t20), 'T20');
  assert.equal(automaticCandleInterval(t20), '1m');
  assert.equal(pollInterval(t20), 5000);
  assert.equal(prices(odi).priceDraw, 0);
  assert.equal(prices(t20).priceDraw, 0);
  assert.equal(
    normalizeEvent({
      ...odiEvent,
      competitors: [{ name: 'India', score: '200/5 (35/40 ov, target 251)' }, odiEvent.competitors[1]],
    }),
    null,
  );
  assert.throws(() => validateState({ ...odi, innings: 3 }), /Innings/);
  assert.throws(() => validateState({ ...test, totalBalls: 540 }), /no ball limit/);
  for (let runs = 92; runs <= 392; runs += 10) {
    const s: CricketState = { ...test, runs, teamRuns: [317, 113 + runs] };
    const q = prices(s),
      p = probabilities(s);
    assert(Math.abs(p.reduce((a, b) => a + b) - 1) < 1e-10);
    assert.equal(
      [0, 1, 2].reduce((sum, o) => sum + outcomePrice(q, o), 0),
      1000,
    );
    assert([0, 1, 2].every((o) => Number.isInteger(outcomePrice(q, o)) && outcomePrice(q, o) > 0));
  }
  assert(
    probabilities({ ...test, day: 4 })[2] > probabilities(test)[2],
    'Less time increases estimated draw chance',
  );
  assert.equal(entryClosed(50, 901), true, 'Draw can trigger entry cutoff');
  assert.equal(entryClosed(50, 900), false);

  const drawEvent = {
    ...event,
    status: 'post',
    summary: 'Result',
    fullStatus: { ...event.fullStatus, longSummary: 'Match drawn' },
  };
  assert.equal(confirmedResult(drawEvent, test)!.winner, 2);
  assert.equal(confirmedResult(drawEvent, odi), null);
  assert.equal(confirmedResult({ ...drawEvent, fullStatus: { longSummary: 'Match tied' } }, test), null);
  assert.equal(
    confirmedResult(
      {
        ...drawEvent,
        fullStatus: { longSummary: 'Match abandoned - no result' },
      },
      test,
    )!.winner,
    null,
  );

  const a = await prisma.user.create({
    data: { username: 'draw-buyer', wallet: { create: { balance: 1000 } } },
  });
  const b = await prisma.user.create({
    data: { username: 'team-buyer', wallet: { create: { balance: 1000 } } },
  });
  const id = `espn-${event.id}`;
  await create(id, test);
  await service.fund(id, a.id, 100000, 'draw-fund-a');
  await service.fund(id, b.id, 100000, 'draw-fund-b');
  const q = (await service.snapshot(id, a.id)).market.quote!;
  const buy = {
    requestId: 'draw-buy-001',
    quoteId: q.id,
    side: 'BUY' as const,
    outcome: 2 as const,
    quantity: 100,
  };
  await service.trade(id, a.id, buy);
  await service.trade(id, a.id, buy);
  await service.trade(id, b.id, {
    ...buy,
    requestId: 'team-buy-001',
    outcome: 0,
  });
  const account = (await service.snapshot(id, a.id)).account;
  assert.equal(account.balance, 100000 - q.priceDraw! * 100);
  assert.equal(account.positions[0].value, q.priceDraw! * 100);
  assert.equal(account.equity, 100000);
  assert.equal((await service.history(id, 2, 'auto'))[0].close, q.priceDraw! / 10);
  assert.equal((await service.history(id, 1, 'auto'))[0].close, outcomePrice(q, 1) / 10);
  await assert.rejects(
    service.trade(id, b.id, {
      ...buy,
      requestId: 'draw-short-test',
      side: 'SELL',
    }),
    /only sell/,
  );
  await prisma.tradingQuote.update({
    where: { id: q.id },
    data: { price0: 50, priceDraw: 901 },
  });
  await assert.rejects(service.fund(id, a.id, 1000, 'draw-cutoff-fund'), /above 90%/);
  await assert.rejects(service.trade(id, a.id, { ...buy, requestId: 'draw-cutoff-buy' }), /above 90%/);
  await service.trade(id, a.id, {
    ...buy,
    side: 'SELL',
    quantity: 20,
    requestId: 'draw-exit-001',
  });
  await prisma.tradingQuote.update({
    where: { id: q.id },
    data: { price0: q.price0, priceDraw: q.priceDraw! },
  });
  assert.equal((await service.snapshot(id, a.id)).account.positions[0].quantity, 80);
  let suppliedEvent: any = drawEvent;
  const worker = new TradingWorker(async () => ({
    sports: [{ leagues: [{ events: [suppliedEvent] }] }],
  }));
  async function tick() {
    await prisma.tradingLease.updateMany({ data: { nextPollAt: new Date(0) } });
    await worker.tick();
  }
  await tick();
  assert.equal((await service.snapshot(id, a.id)).market.status, 'SUSPENDED');
  assert.equal((await service.snapshot(id, a.id)).account.receipt, null);
  await tick();
  const settled = await service.snapshot(id, a.id),
    other = await service.snapshot(id, b.id);
  assert.equal(settled.market.status, 'SETTLED');
  assert.equal(settled.market.winner, 2);
  assert.equal(settled.market.quote!.priceDraw, 1000);
  assert.equal(outcomePrice(settled.market.quote!, 1), 0);
  assert.equal(settled.account.receipt!.payout + other.account.receipt!.payout, 200000);
  assert(settled.account.receipt!.reward > 0);
  assert.equal((await service.history(id, 2, 'over')).at(-1)!.close, 100);
  await tick();
  assert.deepEqual((await service.snapshot(id, a.id)).account.receipt, settled.account.receipt);
  assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } })).balance, settled.account.receipt!.payout / 100);
  for (const [format, state] of [
    ['odi', odi],
    ['t20', t20],
  ] as const) {
    await create(format, state);
    await assert.rejects(service.settle(format, 2, 'Invalid draw'), /only for Test/);
    await assert.rejects(service.history(format, 2, 'auto'), /only for Test/);
    const quote = (await service.snapshot(format, a.id)).market.quote!;
    await assert.rejects(service.trade(format, a.id, { ...buy, quoteId: quote.id }), /only for Test/);
  }
  await create('cash-test-model', test);
  await prisma.tradingMarket.update({
    where: { id: 'cash-test-model' },
    data: { source: 'VERIFIED', mode: 'CASH' },
  });
  process.env.CRICTRADE_CASH_ENABLED = 'false';
  assert.equal((await service.snapshot('cash-test-model', a.id)).market.modelVersion, MULTIFORMAT_MODEL);
  await assert.rejects(service.fund('cash-test-model', a.id, 1000, 'cash-model-guard'), /entries are disabled/);
  delete process.env.CRICTRADE_CASH_ENABLED;
  await create('test-transition', test);
  const next: CricketState = {
    ...chase,
    batting: 0,
    runs: 10,
    target: 47,
    teamRuns: [327, 363],
  };
  await service.publish('test-transition', next);
  assert.equal((await service.snapshot('test-transition', a.id)).market.status, 'OPEN');
  await service.publish('test-transition', {
    ...next,
    runs: 11,
    teamRuns: [328, 362],
  });
  assert.equal(
    (await service.snapshot('test-transition', a.id)).market.status,
    'SUSPENDED',
    'Historical score corrections pause trading',
  );
  console.log(
    'PASS: ODI/Test parsing, follow-ons, declarations, fourth-innings targets, format-specific cadence, three-outcome prices, Draw trading/cutoff/settlement, conservation and cash entry switch.',
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
