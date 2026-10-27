import './test-env';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import { allocate, RULES } from '../src/modules/trading/domain';
import { tradingService as service } from '../src/modules/trading/trading.service';

async function main() {
  const rows = [{ id: 'a', deposit: 100000, balance: 110000 }, { id: 'b', deposit: 100000, balance: 50000 }];
  assert.deepEqual(allocate(rows).map(a => a.payout), [110000, 50000]);
  assert.deepEqual(allocate(rows, false, false).map(a => a.payout), [150000, 50000]);
  assert.deepEqual(allocate(rows, true).map(a => a.payout), [100000, 100000]);
  assert.deepEqual(allocate([{ id: 'a', deposit: 100, balance: 110 }, { id: 'b', deposit: 100, balance: 0 }]).map(a => a.reward), [10, 0]);
  const short = allocate([{ id: 'a', deposit: 100, balance: 103 }, { id: 'b', deposit: 100, balance: 102 }, { id: 'c', deposit: 100, balance: 99 }]);
  assert.deepEqual(short.map(a => a.reward), [1, 0, 0], 'One paise is assigned deterministically below the cap');
  for (const rulesVersion of [RULES, 'pooled-v1']) {
    const [a, b] = await Promise.all(['a', 'b'].map(name => prisma.user.create({
      data: { username: `${rulesVersion}-${name}`, wallet: { create: { balance: 1000 } } },
    })));
    const id = await service.createSimulation();
    await prisma.tradingMarket.update({ where: { id }, data: { source: 'VERIFIED', mode: 'CASH', rulesVersion } });
    let q = (await service.snapshot(id, a.id)).market.quote!;
    await prisma.tradingQuote.update({ where: { id: q.id }, data: { price0: 500 } });
    await service.fund(id, a.id, 100000, 'cap-fund-a');
    await service.fund(id, b.id, 100000, 'cap-fund-b');
    const buy = { quoteId: q.id, requestId: 'cap-buy-a', side: 'BUY' as const, outcome: 0 as const, quantity: 200 };
    await service.trade(id, a.id, buy);
    await service.trade(id, b.id, { ...buy, requestId: 'cap-buy-b', outcome: 1, quantity: 100 });
    await service.publish(id, { ...q.state, balls: 1, runs: 1 });
    q = (await service.snapshot(id, a.id)).market.quote!;
    await prisma.tradingQuote.update({ where: { id: q.id }, data: { price0: 550 } });
    await service.trade(id, a.id, { ...buy, quoteId: q.id, requestId: 'cap-exit-a', side: 'SELL' });
    // Project the final team result before settlement to verify provisional surplus.
    await prisma.tradingQuote.update({ where: { id: q.id }, data: { price0: 1000 } });
    const surplus = rulesVersion === RULES ? 40000 : 0;
    assert.equal((await service.snapshot(id, a.id)).pool.platformSurplus, surplus);
    await service.settle(id, 0, 'Confirmed result');
    await service.settle(id, 0, 'Duplicate result');
    const snapshot = await service.snapshot(id, a.id);
    assert.equal(snapshot.market.platformSurplus, surplus);
    assert.equal(snapshot.pool.platformSurplus, surplus);
    assert.equal(snapshot.account.receipt!.rulesVersion, rulesVersion);
    assert.equal(snapshot.account.receipt!.reward, rulesVersion === RULES ? 10000 : 50000);
    const wa = await prisma.wallet.findUniqueOrThrow({ where: { userId: a.id } });
    const wb = await prisma.wallet.findUniqueOrThrow({ where: { userId: b.id } });
    assert.equal(wa.balance, rulesVersion === RULES ? 1100 : 1500);
    assert.equal(wb.balance, 500);
    assert.equal(wa.lockedBalance + wb.lockedBalance, 0);
    assert.equal(Math.round((wa.balance + wb.balance) * 100) + surplus, 200000);
    const operation = await prisma.tradingOperation.findFirstOrThrow({ where: { marketId: id, requestId: 'final-settlement' } });
    const audit = JSON.parse(operation.result);
    assert.equal(audit.platformSurplus, surplus);
    assert.equal(audit.totalPayout + audit.platformSurplus, 200000);
    assert.equal(await prisma.transaction.count({ where: { referenceId: id, type: 'TRADING_SETTLEMENT' } }), 2);
    // All pages, including older than the snapshot's 100-row execution window.
    const account = await prisma.tradingAccount.findUniqueOrThrow({ where: { marketId_userId: { marketId: id, userId: a.id } } });
    await prisma.tradingExecution.createMany({ data: Array.from({ length: 105 }, (_, i) => ({
      id: `${rulesVersion}-history-${String(i).padStart(3, '0')}`, accountId: account.id, quoteId: q.id,
      side: i % 2 ? 'BUY' : 'SELL', outcome: 0, quantity: 1, price: 500, total: 500, createdAt: new Date('2020-01-01'),
    })) });
    const seen = new Set<string>(); let cursor: string | undefined;
    do {
      const page = await service.tradeHistory(a.id, cursor);
      for (const row of page.items) { assert(!seen.has(row.id)); seen.add(row.id); assert.equal(row.marketId, id); }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(seen.size, 107);
    const history = await service.tradeHistory(a.id);
    await assert.rejects(service.tradeHistory(b.id, history.items[0].id), /Invalid history cursor/);
  }
  console.log('PASS: 10:1 maximum redemption, reduced pool payouts, rounding, ₹400 platform surplus, atomic wallet settlement, duplicate safety, old rules preservation and complete private history pagination.');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
