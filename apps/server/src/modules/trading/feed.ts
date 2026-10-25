import https from 'https';
import crypto from 'crypto';
import { CricketState } from '@moneygame/shared-types';
import { prisma } from '../../db';
import { serializable } from '../../transaction';
import { parseScore, pollInterval } from './domain';
import { tradingService } from './trading.service';

const ENDPOINT = 'https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket';
export function fetchScoreboard(): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      ENDPOINT,
      { headers: { Accept: 'application/json', 'User-Agent': 'MoneyGame-CricTrade/1.0' } },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
          if (raw.length > 5_000_000) request.destroy(new Error('Feed response too large'));
        });
        response.on('error', reject);
        response.on('end', () => {
          if (response.statusCode !== 200) {
            const e: any = new Error(`Feed HTTP ${response.statusCode}`);
            const retry = String(response.headers['retry-after'] || '');
            e.retryMs = /^\d+$/.test(retry)
              ? Number(retry) * 1000
              : Math.max(0, Date.parse(retry) - Date.now()) || 0;
            reject(e);
            return;
          }
          try {
            const data = JSON.parse(raw);
            if (!Array.isArray(data.sports)) throw new Error('Invalid scoreboard');
            resolve(data);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    const timer = setTimeout(() => request.destroy(new Error('Feed timeout')), 15000);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
  });
}
export function normalizeEvent(event: any): CricketState | null {
  if (!Array.isArray(event.competitors) || event.competitors.length !== 2) return null;
  const scores = event.competitors.map((t: any) => parseScore(t.score));
  const innings = Number(event.period);
  if (innings !== 1 && innings !== 2) return null;
  let batting =
    innings === 1
      ? scores.findIndex((s: any) => s?.totalBalls === 120)
      : scores.findIndex((s: any) => s?.totalBalls === 120 && s?.target);
  if (batting < 0) return null;
  const s = scores[batting];
  if (!s || s.balls > 120 || s.wickets > 10) return null;
  // Missing/revised targets and reduced-overs fixtures remain observational.
  if (innings === 2 && !s.target) return null;
  return {
    innings,
    batting: batting as 0 | 1,
    runs: s.runs,
    wickets: s.wickets,
    balls: s.balls,
    totalBalls: 120,
    target: innings === 2 ? s.target : null,
    description: `${event.competitors[batting].displayName || event.competitors[batting].name} ${event.competitors[batting].score}`,
  };
}
export class TradingWorker {
  constructor(private readFeed: () => Promise<any> = fetchScoreboard) {}
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = true;
  private owner = crypto.randomUUID();
  private failures = 0;
  private nextReplay = 0;
  async start() {
    this.stopped = false;
    this.schedule();
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
  private schedule() {
    if (!this.stopped)
      this.timer = setTimeout(() => {
        void this.tick().finally(() => this.schedule());
      }, 1000);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const claimed = await serializable(async (tx) => {
        await tx.tradingLease.upsert({
          where: { id: 'crictrade' },
          create: { id: 'crictrade', owner: '', expiresAt: new Date(0), nextPollAt: new Date(0) },
          update: {},
        });
        const r = await tx.tradingLease.updateMany({
          where: { id: 'crictrade', OR: [{ owner: this.owner }, { expiresAt: { lt: now } }] },
          data: { owner: this.owner, expiresAt: new Date(Date.now() + 60000) },
        });
        return r.count > 0;
      });
      if (!claimed) return;
      if (Date.now() >= this.nextReplay) {
        this.nextReplay = Date.now() + 10000;
        await this.replay();
      }
      if (process.env.CRICTRADE_ESPN_ENABLED === 'false') return;
      const lease = await prisma.tradingLease.findUniqueOrThrow({ where: { id: 'crictrade' } });
      if (lease.nextPollAt.getTime() > Date.now()) return;
      let next = 60000;
      try {
        const data = await this.readFeed();
        this.failures = 0;
        const events = data.sports.flatMap((s: any) => (s.leagues || []).flatMap((l: any) => l.events || []));
        for (const event of events) {
          const id = `espn-${event.id}`;
          if (!event.id || !Array.isArray(event.competitors) || event.competitors.length !== 2) continue;
          const state = normalizeEvent(event);
          let existing = await prisma.tradingMarket.findUnique({ where: { id } });
          if (
            !existing &&
            (!state || event.status !== 'in' || !/^(Live|In Progress)$/i.test(event.summary || ''))
          )
            continue;
          if (!existing) {
            existing = await prisma.tradingMarket.create({
              data: {
                id,
                source: 'ESPN',
                title: event.name,
                team0: event.competitors[0].displayName || event.competitors[0].name,
                team1: event.competitors[1].displayName || event.competitors[1].name,
                reason: 'Waiting for supported T20 state',
              },
            });
          }
          if (['SETTLED', 'VOIDED'].includes(existing.status)) continue;
          if (
            existing.team0 !== (event.competitors[0].displayName || event.competitors[0].name) ||
            existing.team1 !== (event.competitors[1].displayName || event.competitors[1].name)
          ) {
            await tradingService.pause(
              id,
              true,
              'Provider team identities changed; operator review required',
              'system',
            );
            continue;
          }
          if (event.status === 'post') {
            const winner = event.competitors.findIndex((t: any) => t.winner === true);
            if (winner < 0 || event.competitors.filter((t: any) => t.winner === true).length !== 1) {
              await prisma.tradingMarket.updateMany({
                where: { id, status: { notIn: ['SETTLED', 'VOIDED'] } },
                data: {
                  status: 'SUSPENDED',
                  reason: 'Final result has no unique winner; operator must confirm result or refund',
                },
              });
              continue;
            }
            // Persist result observations so a restart cannot bypass confirmation.
            const observation = `result:${winner}`;
            if (existing.fingerprint === observation)
              await tradingService.settle(
                id,
                winner < 0 ? null : winner,
                'Confirmed provider result (test mode)',
              );
            else
              await prisma.tradingMarket.updateMany({
                where: { id, status: { notIn: ['SETTLED', 'VOIDED'] } },
                data: {
                  status: 'SUSPENDED',
                  fingerprint: observation,
                  reason: 'Awaiting a second matching result observation',
                },
              });
          } else if (['canc', 'abandoned', 'postponed'].includes(event.status)) {
            // An interruption is not enough to destroy a pool. Await operator review.
            await prisma.tradingMarket.updateMany({
              where: { id, status: { notIn: ['SETTLED', 'VOIDED'] } },
              data: { status: 'SUSPENDED', reason: 'Match interrupted; awaiting result review' },
            });
          } else if (state && event.status === 'in' && /^(Live|In Progress)$/i.test(event.summary || '')) {
            await tradingService.publish(id, state);
            next = Math.min(next, pollInterval(state));
          } else {
            await prisma.tradingMarket.updateMany({
              where: { id, status: { notIn: ['SETTLED', 'VOIDED'] } },
              data: {
                status: 'SUSPENDED',
                reason: 'Unsupported or interrupted match state; waiting for confirmed inputs',
                feedReceivedAt: new Date(),
              },
            });
          }
        }
      } catch (error: any) {
        this.failures++;
        next =
          Math.max(Math.min(15 * 60000, 60000 * 2 ** Math.min(this.failures - 1, 4)), error.retryMs || 0) +
          Math.floor(Math.random() * 1000);
        await prisma.tradingMarket.updateMany({
          where: { source: 'ESPN', status: 'OPEN' },
          data: { status: 'SUSPENDED', reason: 'Score feed unavailable; retrying with backoff' },
        });
        console.warn('[CricTrade] Feed unavailable:', error.code || error.message);
      }
      await prisma.tradingLease.updateMany({
        where: { id: 'crictrade', owner: this.owner },
        data: { nextPollAt: new Date(Date.now() + next) },
      });
    } catch (error: any) {
      console.error('[CricTrade] Worker:', error.message);
    } finally {
      this.running = false;
    }
  }
  private async replay() {
    const markets = await prisma.tradingMarket.findMany({
      where: { source: 'SIMULATION', status: { in: ['OPEN', 'SUSPENDED'] }, adminPaused: false },
      take: 5,
    });
    const pattern = [1, 0, 4, 1, 2, 0, 6, 1, 0, 2, 1, 4, 0, 1, 0, 6, 1, 2, 4, 0];
    for (const m of markets) {
      const s = JSON.parse(m.snapshot) as CricketState;
      if (!s.totalBalls) continue;
      if (s.balls >= s.totalBalls || s.wickets >= 10 || s.runs >= s.target!) {
        await tradingService.settle(m.id, s.runs >= s.target! ? 0 : 1, 'Simulation finished');
        continue;
      }
      const step = m.replayStep + 1,
        wicket = step % 23 === 0;
      const next = {
        ...s,
        balls: s.balls + 1,
        runs: s.runs + (wicket ? 0 : pattern[m.replayStep % pattern.length]),
        wickets: s.wickets + (wicket ? 1 : 0),
        description: wicket
          ? 'Simulated delivery · wicket'
          : `Simulated delivery · ${pattern[m.replayStep % pattern.length]} runs`,
      };
      await tradingService.publish(m.id, next, new Date(), step);
    }
  }
}
export const tradingWorker = new TradingWorker();
