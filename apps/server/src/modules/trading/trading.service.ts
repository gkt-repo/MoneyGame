import crypto from 'crypto';
import { Server } from 'socket.io';
import { Prisma } from '@prisma/client';
import {
  CricketState,
  TradingAccountDTO,
  TradingMarketDTO,
  TradingOrderInput,
  TradingReceipt,
  TradingSnapshotDTO,
} from '@moneygame/shared-types';
import { prisma } from '../../db';
import { serializable } from '../../transaction';
import { moveWallet } from '../../wallet-ledger';
import {
  allocate,
  assertEntryAllowed,
  automaticCandleInterval,
  candles,
  entryClosed,
  integer,
  LIMIT,
  MODEL,
  pollInterval,
  price,
  RULES,
  TradingError,
  validateState,
} from './domain';

const emptyAccount: TradingAccountDTO = {
  deposit: 0,
  balance: 0,
  equity: 0,
  net: 0,
  realized: 0,
  positions: [],
  receipt: null,
};
type Tx = Prisma.TransactionClient;
export class TradingService {
  private io: Server | null = null;
  private pendingNotifications = new Set<string>();
  setSocketServer(io: Server) {
    this.io = io;
  }
  notify(id: string, userId?: string) {
    if (!this.io) return;
    // A busy market must not trigger two HTTP refreshes per trade for every viewer.
    if (!this.pendingNotifications.has(id)) {
      this.pendingNotifications.add(id);
      setTimeout(() => {
        this.pendingNotifications.delete(id);
        this.io?.emit('trading_market_updated', { marketId: id });
      }, 1500).unref();
    }
    if (userId) this.io?.to(`user:${userId}`).emit('trading_account_updated', { marketId: id });
  }
  private async lock(tx: Tx, id: string) {
    const found = await tx.tradingMarket.updateMany({ where: { id }, data: { revision: { increment: 1 } } });
    if (!found.count) throw new TradingError('NOT_FOUND', 'Trading match not found', 404);
    return tx.tradingMarket.findUniqueOrThrow({ where: { id } });
  }
  private assertCash(market: { mode: string; source: string; modelVersion: string }) {
    if (
      market.mode === 'CASH' &&
      (process.env.CRICTRADE_CASH_ENABLED !== 'true' ||
        market.source !== 'VERIFIED' ||
        market.modelVersion === MODEL)
    ) {
      throw new TradingError(
        'CASH_UNAVAILABLE',
        'Cash trading requires a verified feed and an approved model',
        409,
      );
    }
  }
  private requestId(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value))
      throw new TradingError('INVALID_INPUT', 'Invalid request ID');
    return value;
  }
  private async previous(tx: Tx, marketId: string, userId: string, requestId: string, payload: string) {
    const old = await tx.tradingOperation.findUnique({
      where: { marketId_userId_requestId: { marketId, userId, requestId } },
    });
    if (old && old.payload !== payload)
      throw new TradingError('REQUEST_CONFLICT', 'Request ID already used for another operation', 409);
    return old ? JSON.parse(old.result) : null;
  }
  async createSimulation() {
    const id = crypto.randomUUID();
    await prisma.tradingMarket.create({
      data: {
        id,
        source: 'SIMULATION',
        title: 'IND vs NZ · simulation',
        team0: 'India',
        team1: 'New Zealand',
        rulesVersion: RULES,
        modelVersion: MODEL,
      },
    });
    await this.publish(id, {
      innings: 2,
      batting: 0,
      runs: 0,
      wickets: 0,
      balls: 0,
      totalBalls: 120,
      target: 181,
      description: 'Simulated chase · India need 181',
    });
    return id;
  }
  async publish(id: string, state: CricketState, receivedAt = new Date(), step?: number) {
    validateState(state);
    const fingerprint = JSON.stringify({ ...state, description: '' });
    const result = await serializable(async (tx) => {
      const m = await this.lock(tx, id);
      if (['SETTLED', 'VOIDED'].includes(m.status)) return false;
      if (m.fingerprint === fingerprint) {
        await tx.tradingMarket.update({ where: { id }, data: { feedReceivedAt: receivedAt } });
        return false;
      }
      const prior = JSON.parse(m.snapshot) as Partial<CricketState>;
      if (
        m.source === 'ESPN' &&
        prior.innings &&
        (state.innings < prior.innings ||
          (state.innings === prior.innings &&
            (state.batting !== prior.batting ||
              state.balls < prior.balls! ||
              state.runs < prior.runs! ||
              state.wickets < prior.wickets! ||
              state.target !== prior.target)))
      ) {
        await tx.tradingMarket.update({
          where: { id },
          data: {
            status: 'SUSPENDED',
            adminPaused: true,
            snapshot: JSON.stringify(state),
            fingerprint,
            feedReceivedAt: receivedAt,
            reason: 'Score correction or revised target; operator review required',
          },
        });
        return true;
      }
      const now = new Date(),
        sequence = m.sequence + 1;
      const inningsEnded =
        state.balls >= state.totalBalls ||
        state.wickets >= 10 ||
        (state.innings === 2 && state.runs >= state.target!);
      const expiresAt = new Date(now.getTime() + (m.source === 'SIMULATION' ? 30000 : 90000));
      await tx.tradingQuote.create({
        data: {
          marketId: id,
          sequence,
          price0: price(state),
          snapshot: JSON.stringify(state),
          publishedAt: now,
          expiresAt,
        },
      });
      await tx.tradingMarket.update({
        where: { id },
        data: {
          sequence,
          fingerprint,
          snapshot: JSON.stringify(state),
          snapshotChangedAt: now,
          feedReceivedAt: receivedAt,
          status: m.adminPaused || inningsEnded ? 'SUSPENDED' : 'OPEN',
          reason: m.adminPaused
            ? m.reason
            : inningsEnded
              ? 'Innings ended; awaiting confirmed next state or result'
              : m.source === 'ESPN'
                ? 'Sampled feed · test credits · experimental probability'
                : 'Simulated match · test credits',
          ...(step === undefined ? {} : { replayStep: step }),
        },
      });
      return true;
    });
    if (result) this.notify(id);
    return result;
  }
  private marketDTO(m: any): TradingMarketDTO {
    const q = m.quotes?.[0];
    const expired = q && q.expiresAt.getTime() <= Date.now() && m.status === 'OPEN';
    return {
      id: m.id,
      title: m.title,
      team0: m.team0,
      team1: m.team1,
      source: m.source,
      mode: m.mode,
      status: expired ? 'SUSPENDED' : m.status,
      entryClosed: q ? entryClosed(q.price0) : false,
      reason: expired ? 'Waiting for a changed score; last quote expired' : m.reason,
      rulesVersion: m.rulesVersion,
      modelVersion: m.modelVersion,
      updatedAt: m.updatedAt.toISOString(),
      feedReceivedAt: m.feedReceivedAt?.toISOString() ?? null,
      snapshotChangedAt: m.snapshotChangedAt?.toISOString() ?? null,
      pollingMs: q ? pollInterval(JSON.parse(q.snapshot)) : 60000,
      winner: m.winner,
      isSimulation: m.source === 'SIMULATION',
      quote: q
        ? {
            id: q.id,
            sequence: q.sequence,
            price0: q.price0,
            publishedAt: q.publishedAt.toISOString(),
            expiresAt: q.expiresAt.toISOString(),
            state: JSON.parse(q.snapshot),
          }
        : null,
    };
  }
  async list(where: Prisma.TradingMarketWhereInput = {}) {
    const ms = await prisma.tradingMarket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { quotes: { orderBy: { sequence: 'desc' }, take: 1 } },
    });
    return ms.map((m) => this.marketDTO(m));
  }
  async listForUser(userId: string, positions = false) {
    const realSources = { source: { in: ['ESPN', 'VERIFIED'] } };
    if (positions) {
      return this.list({ ...realSources, accounts: { some: { userId, deposit: { gt: 0 } } } });
    }
    const now = new Date();
    const markets = await this.list({
      ...realSources,
      status: 'OPEN',
      adminPaused: false,
      feedReceivedAt: { gte: new Date(now.getTime() - 120000) },
      quotes: { some: { expiresAt: { gt: now } } },
    });
    return markets.filter((m) => m.status === 'OPEN');
  }
  async snapshot(id: string, userId: string): Promise<TradingSnapshotDTO> {
    return serializable(async (tx) => {
      const m = await tx.tradingMarket.findUnique({
        where: { id },
        include: {
          quotes: { orderBy: { sequence: 'desc' }, take: 1 },
          accounts: { include: { positions: true } },
        },
      });
      if (!m) throw new TradingError('NOT_FOUND', 'Trading match not found', 404);
      const market = this.marketDTO(m),
        p0 = market.quote?.price0 ?? 500;
      const values = m.accounts.map((a) => ({
        id: a.id,
        deposit: a.deposit,
        balance:
          a.balance + a.positions.reduce((n, p) => n + p.quantity * (p.outcome === 0 ? p0 : 1000 - p0), 0),
      }));
      const allocation = allocate(values);
      const a = m.accounts.find((a) => a.userId === userId);
      const own = a ? allocation.find((v) => v.id === a.id) : null;
      const positions =
        a?.positions.map((p) => {
          const value = p.quantity * (p.outcome === 0 ? p0 : 1000 - p0);
          return {
            outcome: p.outcome as 0 | 1,
            quantity: p.quantity,
            cost: p.cost,
            averagePrice: p.quantity ? p.cost / p.quantity : 0,
            value,
            unrealized: value - p.cost,
          };
        }) ?? [];
      const equity = (a?.balance ?? 0) + positions.reduce((n, p) => n + p.value, 0);
      const receipt = a?.receipt ? (JSON.parse(a.receipt) as TradingReceipt) : null;
      const account = a
        ? {
            deposit: a.deposit,
            balance: a.balance,
            realized: a.realized,
            equity,
            net: equity - a.deposit,
            positions,
            receipt,
          }
        : { ...emptyAccount };
      const executions = a
        ? await tx.tradingExecution.findMany({
            where: { accountId: a.id },
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : [];
      const receipts = m.accounts
        .filter((a) => a.receipt)
        .map((a) => JSON.parse(a.receipt!) as TradingReceipt);
      return {
        market,
        account,
        executions: executions.map((e) => ({
          ...e,
          side: e.side as 'BUY' | 'SELL',
          outcome: e.outcome as 0 | 1,
          createdAt: e.createdAt.toISOString(),
        })),
        pool: {
          participants: m.accounts.length,
          deposits: m.accounts.reduce((n, a) => n + a.deposit, 0),
          losses: receipts.length
            ? receipts.reduce((n, r) => n + r.loss, 0)
            : values.reduce((n, v) => n + Math.max(0, v.deposit - v.balance), 0),
          gains: values.reduce((n, v) => n + Math.max(0, v.balance - v.deposit), 0),
          estimatedReward: receipt?.reward ?? own?.reward ?? 0,
          estimatedPrincipal: receipt?.principal ?? own?.principal ?? 0,
          provisional: !['SETTLED', 'VOIDED'].includes(m.status),
        },
      };
    });
  }
  async history(id: string, outcome: number, interval: string, before?: number) {
    integer(outcome, 0, 1, 'Outcome');
    if (before !== undefined) integer(before, 0, 9_000_000_000_000, 'History time');
    const qs = await prisma.tradingQuote.findMany({
      where: { marketId: id, ...(before === undefined ? {} : { publishedAt: { lt: new Date(before) } }) },
      orderBy: { sequence: 'desc' },
      take: 3000,
    });
    qs.reverse();
    const executions = qs.length
      ? await prisma.tradingExecution.findMany({
          where: {
            account: { marketId: id },
            outcome,
            createdAt: { gte: qs[0].publishedAt, ...(before === undefined ? {} : { lt: new Date(before) }) },
          },
          select: { createdAt: true, quantity: true },
        })
      : [];
    const resolvedInterval =
      interval === 'auto'
        ? qs.length
          ? automaticCandleInterval(JSON.parse(qs[qs.length - 1].snapshot))
          : 'over'
        : interval;
    return candles(qs, outcome, resolvedInterval, executions);
  }
  async fund(id: string, userId: string, units: unknown, requestId: unknown) {
    const amount = integer(units, 100, LIMIT, 'Funding amount'),
      key = this.requestId(requestId);
    const payload = JSON.stringify({ type: 'FUND', amount });
    const result = await serializable(async (tx) => {
      const m = await this.lock(tx, id);
      const old = await this.previous(tx, id, userId, key, payload);
      if (old) return old;
      if (m.status !== 'OPEN' || m.adminPaused)
        throw new TradingError('MARKET_CLOSED', 'Funding is unavailable while the market is closed', 409);
      const liveQuote = await tx.tradingQuote.findFirst({
        where: { marketId: id },
        orderBy: { sequence: 'desc' },
      });
      if (!liveQuote || liveQuote.expiresAt.getTime() <= Date.now())
        throw new TradingError('PRICE_CHANGED', 'Wait for a fresh quote before funding', 409);
      assertEntryAllowed(liveQuote.price0);
      this.assertCash(m);
      const a = await tx.tradingAccount.upsert({
        where: { marketId_userId: { marketId: id, userId } },
        create: { marketId: id, userId },
        update: {},
      });
      integer(a.deposit + amount, 0, LIMIT, 'Total funding');
      integer(a.balance + amount, 0, 2_000_000_000, 'Balance');
      const holdings = await tx.tradingPosition.findMany({ where: { accountId: a.id } });
      integer(
        a.balance + amount + holdings.reduce((n, p) => n + p.quantity * 1000, 0),
        0,
        2_000_000_000,
        'Maximum account value',
      );
      if (m.mode === 'CASH') {
        await moveWallet(tx, userId, -amount / 100, amount / 100);
        await tx.transaction.create({
          data: {
            userId,
            amount: -amount / 100,
            type: 'TRADING_FUND',
            referenceId: id,
            idempotencyKey: `trading:${id}:${userId}:${key}`,
            description: 'CricTrade match funding',
          },
        });
      }
      await tx.tradingAccount.update({
        where: { id: a.id },
        data: { deposit: { increment: amount }, balance: { increment: amount } },
      });
      const response = { success: true, requestId: key };
      await tx.tradingOperation.create({
        data: { marketId: id, userId, requestId: key, payload, result: JSON.stringify(response) },
      });
      return response;
    });
    this.notify(id, userId);
    return result;
  }
  async trade(id: string, userId: string, input: TradingOrderInput) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new TradingError('INVALID_INPUT', 'An order object is required');
    const key = this.requestId(input.requestId);
    const quantity = integer(input.quantity, 1, 1_000_000, 'Share quantity'),
      outcome = integer(input.outcome, 0, 1, 'Outcome');
    if (!['BUY', 'SELL'].includes(input.side) || typeof input.quoteId !== 'string')
      throw new TradingError('INVALID_INPUT', 'Invalid order');
    const payload = JSON.stringify({
      type: 'TRADE',
      side: input.side,
      quantity,
      outcome,
      quoteId: input.quoteId,
    });
    const result = await serializable(async (tx) => {
      const m = await this.lock(tx, id);
      const old = await this.previous(tx, id, userId, key, payload);
      if (old) return old;
      this.assertCash(m);
      if (m.status !== 'OPEN' || m.adminPaused)
        throw new TradingError('MARKET_CLOSED', 'Trading is paused or finished', 409);
      const q = await tx.tradingQuote.findFirst({ where: { marketId: id }, orderBy: { sequence: 'desc' } });
      if (!q || q.id !== input.quoteId || q.expiresAt.getTime() <= Date.now())
        throw new TradingError(
          'PRICE_CHANGED',
          'Quote changed or expired. Refresh and confirm the new price.',
          409,
        );
      if (input.side === 'BUY') assertEntryAllowed(q.price0);
      const a = await tx.tradingAccount.findUnique({ where: { marketId_userId: { marketId: id, userId } } });
      if (!a || a.receipt) throw new TradingError('NO_ACCOUNT', 'Add match credits before trading');
      const p = await tx.tradingPosition.upsert({
        where: { accountId_outcome: { accountId: a.id, outcome } },
        create: { accountId: a.id, outcome },
        update: {},
      });
      const unitPrice = outcome === 0 ? q.price0 : 1000 - q.price0,
        total = unitPrice * quantity;
      if (input.side === 'BUY') {
        if (total > a.balance) throw new TradingError('INSUFFICIENT_CREDITS', 'Not enough match credits');
        integer(p.quantity + quantity, 0, 1_000_000, 'Owned shares');
        const positions = await tx.tradingPosition.findMany({ where: { accountId: a.id } });
        integer(
          a.balance - total + (positions.reduce((n, p) => n + p.quantity, 0) + quantity) * 1000,
          0,
          2_000_000_000,
          'Maximum account value',
        );
        await tx.tradingAccount.update({ where: { id: a.id }, data: { balance: { decrement: total } } });
        await tx.tradingPosition.update({
          where: { id: p.id },
          data: { quantity: { increment: quantity }, cost: { increment: total } },
        });
      } else {
        if (quantity > p.quantity)
          throw new TradingError('INSUFFICIENT_SHARES', 'You can only sell shares you own');
        integer(a.balance + total, 0, 2_000_000_000, 'Balance');
        const basis = quantity === p.quantity ? p.cost : Math.floor((p.cost * quantity) / p.quantity);
        await tx.tradingAccount.update({
          where: { id: a.id },
          data: { balance: { increment: total }, realized: { increment: total - basis } },
        });
        await tx.tradingPosition.update({
          where: { id: p.id },
          data: { quantity: { decrement: quantity }, cost: { decrement: basis } },
        });
      }
      const execution = await tx.tradingExecution.create({
        data: {
          accountId: a.id,
          quoteId: q.id,
          side: input.side,
          outcome,
          quantity,
          price: unitPrice,
          total,
        },
      });
      const response = { success: true, requestId: key, executionId: execution.id };
      await tx.tradingOperation.create({
        data: { marketId: id, userId, requestId: key, payload, result: JSON.stringify(response) },
      });
      return response;
    });
    this.notify(id, userId);
    return result;
  }
  async requestResult(id: string, userId: string, key: string) {
    const r = await prisma.tradingOperation.findUnique({
      where: { marketId_userId_requestId: { marketId: id, userId, requestId: key } },
    });
    if (!r) throw new TradingError('NOT_FOUND', 'Request not found', 404);
    return JSON.parse(r.result);
  }
  async pause(id: string, paused: boolean, reason: string, actor: string) {
    if (!reason.trim()) throw new TradingError('INVALID_INPUT', 'A reason is required');
    await serializable(async (tx) => {
      const m = await this.lock(tx, id);
      if (['SETTLED', 'VOIDED'].includes(m.status))
        throw new TradingError('MARKET_CLOSED', 'Match already settled');
      await tx.tradingMarket.update({
        where: { id },
        data: {
          adminPaused: paused,
          status: 'SUSPENDED',
          reason: paused ? reason : 'Waiting for the next changed snapshot',
        },
      });
      await tx.tradingOperation.create({
        data: {
          marketId: id,
          userId: actor,
          requestId: crypto.randomUUID(),
          payload: JSON.stringify({ type: 'PAUSE', paused, reason }),
          result: '{}',
        },
      });
    });
    this.notify(id);
  }
  async settle(id: string, winner: number | null, reason: string, actor = 'system') {
    if (winner !== null) integer(winner, 0, 1, 'Winner');
    if (!reason.trim()) throw new TradingError('INVALID_INPUT', 'A settlement reason is required');
    const result = await serializable(async (tx) => {
      const m = await this.lock(tx, id);
      if (['SETTLED', 'VOIDED'].includes(m.status)) {
        if (m.winner !== winner)
          throw new TradingError('SETTLEMENT_CONFLICT', 'A different result was already settled', 409);
        return { success: true, alreadySettled: true };
      }
      const accounts = await tx.tradingAccount.findMany({
        where: { marketId: id },
        include: { positions: true },
      });
      const balances = accounts.map((a) => ({
        id: a.id,
        deposit: a.deposit,
        balance:
          a.balance + a.positions.reduce((n, p) => n + (p.outcome === winner ? p.quantity * 1000 : 0), 0),
      }));
      const allocations = allocate(balances, winner === null),
        settledAt = new Date().toISOString();
      const noGains = balances.every((a) => a.balance <= a.deposit);
      for (const allocation of allocations) {
        const a = accounts.find((a) => a.id === allocation.id)!;
        const receipt: TradingReceipt = {
          deposit: a.deposit,
          finalBalance: allocation.balance,
          gain: allocation.gain,
          loss: allocation.loss,
          principal: allocation.principal,
          reward: allocation.reward,
          payout: allocation.payout,
          settledAt,
          mode: m.mode as 'TEST' | 'CASH',
          reason:
            winner === null
              ? `Voided: ${reason}`
              : noGains
                ? 'No positive participants: deposits refunded'
                : reason,
        };
        if (m.mode === 'CASH') {
          await moveWallet(tx, a.userId, allocation.payout / 100, -a.deposit / 100);
          await tx.transaction.create({
            data: {
              userId: a.userId,
              amount: allocation.payout / 100,
              type: 'TRADING_SETTLEMENT',
              referenceId: id,
              idempotencyKey: `trading-settlement:${a.id}`,
              description: receipt.reason,
            },
          });
        }
        await tx.tradingAccount.update({
          where: { id: a.id },
          data: { balance: allocation.balance, receipt: JSON.stringify(receipt) },
        });
        await tx.tradingPosition.updateMany({ where: { accountId: a.id }, data: { quantity: 0, cost: 0 } });
      }
      let finalSnapshot = m.snapshot;
      if (winner !== null) {
        finalSnapshot = JSON.stringify({
          ...JSON.parse(m.snapshot),
          description: `Final result: ${winner === 0 ? m.team0 : m.team1} win · last observed score`,
        });
        await tx.tradingQuote.create({
          data: {
            marketId: id,
            sequence: m.sequence + 1,
            price0: winner === 0 ? 1000 : 0,
            snapshot: finalSnapshot,
            publishedAt: new Date(settledAt),
            expiresAt: new Date(settledAt),
          },
        });
      }
      await tx.tradingMarket.update({
        where: { id },
        data: {
          status: winner === null ? 'VOIDED' : 'SETTLED',
          winner,
          reason,
          snapshot: finalSnapshot,
          sequence: m.sequence + (winner === null ? 0 : 1),
        },
      });
      await tx.tradingOperation.create({
        data: {
          marketId: id,
          userId: actor,
          requestId: 'final-settlement',
          payload: JSON.stringify({ winner, reason }),
          result: JSON.stringify({
            participants: accounts.length,
            totalPayout: allocations.reduce((n, a) => n + a.payout, 0),
          }),
        },
      });
      return { success: true, alreadySettled: false };
    });
    this.notify(id);
    return result;
  }
}
export const tradingService = new TradingService();
