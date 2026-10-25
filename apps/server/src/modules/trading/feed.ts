import https from 'https';
import crypto from 'crypto';
import { CricketFormat, CricketState } from '@moneygame/shared-types';
import { prisma } from '../../db';
import { serializable } from '../../transaction';
import { formatOf, parseScore, pollInterval, validateState } from './domain';
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
  const teams = event.competitors;
  const scores = teams.map((t: any) => parseScore(t.score));
  const classification = [
    event.eventType,
    event.class?.eventType,
    event.class?.name,
    event.class?.generalClassCard,
  ]
    .filter(Boolean)
    .join(' ');
  let format: CricketFormat | null = /\btest\b|first[ -]class/i.test(classification)
    ? 'TEST'
    : /\bodi\b|one[ -]day|list[ -]a/i.test(classification)
      ? 'ODI'
      : /\bt20\b|twenty20/i.test(classification)
        ? 'T20'
        : null;
  if (!format)
    format = scores.some((s: any) => s?.totalBalls === 300)
      ? 'ODI'
      : scores.some((s: any) => s?.totalBalls === 120)
        ? 'T20'
        : null;
  if (!format) return null;
  const innings = Number(event.period);
  const battingId = event.fullStatus?.battingTeamId;
  let batting = battingId ? teams.findIndex((t: any) => String(t.id) === String(battingId)) : -1;
  try {
    if (format === 'TEST') {
      if (batting < 0 || ![1, 2, 3, 4].includes(innings)) return null;
      const history = teams.map((t: any) => parseTestScores(t.score));
      if (history.some((h: any) => h === null)) return null;
      const current = history[batting]!.at(-1);
      if (!current || current.balls === null || current.totalBalls !== null) return null;
      const teamRuns = history.map((h: any[]) => h.reduce((sum, s) => sum + s.runs, 0)) as [number, number];
      const inningsPlayed = history.map((h: any[]) => h.length) as [number, number];
      const target = innings === 4 ? teamRuns[1 - batting] - (teamRuns[batting] - current.runs) + 1 : null;
      if (current.target !== null && current.target !== target) return null;
      const scheduledDays = Number(
        (event.notes || []).find((n: any) => n.type === 'matchdays')?.text?.match(/(\d+)[ -]day match/i)?.[1],
      );
      const session = Number(String(event.fullStatus?.session || '').match(/session\s*(\d)/i)?.[1]);
      return validateState({
        format,
        innings: innings as 1 | 2 | 3 | 4,
        batting: batting as 0 | 1,
        runs: current.runs,
        wickets: current.wickets,
        balls: current.balls,
        totalBalls: null,
        target,
        declared: current.declared,
        teamRuns,
        inningsPlayed,
        day: Number(event.fullStatus?.dayNumber),
        scheduledDays,
        session,
        description: `${teams[batting].displayName || teams[batting].name} ${teams[batting].score} · ${event.fullStatus?.session || ''}`,
      });
    }
    if (innings !== 1 && innings !== 2) return null; // Super Overs need separate market rules.
    const totalBalls = format === 'ODI' ? 300 : 120;
    if (batting < 0) {
      const candidates = scores
        .map((s: any, i: number) => (s?.totalBalls === totalBalls && (innings === 1 || s.target) ? i : -1))
        .filter((i: number) => i >= 0);
      if (candidates.length !== 1) return null;
      batting = candidates[0];
    }
    const s = scores[batting];
    if (!s || s.totalBalls !== totalBalls || (innings === 2 && !s.target)) return null;
    return validateState({
      format,
      innings,
      batting: batting as 0 | 1,
      runs: s.runs,
      wickets: s.wickets,
      balls: s.balls,
      totalBalls,
      target: innings === 2 ? s.target : null,
      description: `${teams[batting].displayName || teams[batting].name} ${teams[batting].score}`,
    });
  } catch {
    return null;
  }
}

// Test scoreboards concatenate innings, e.g. "113 & 92/2 (29.1 ov)".
// Do not infer batting order: follow-ons use the provider's battingTeamId.
function parseTestScores(value: unknown) {
  if (typeof value !== 'string') return null;
  if (!value.trim()) return [];
  const result = [];
  for (const part of value.split('&')) {
    const m =
      /^(\d+)(?:\/(\d+))?\s*(d|dec)?\s*(?:\((\d+)(?:\.(\d))?(?:\/(\d+))?\s*ov(?:,\s*target\s+(\d+))?\))?$/i.exec(
        part.trim(),
      );
    if (!m || Number(m[5] || 0) > 6 || Number(m[2] || 10) > 10) return null;
    result.push({
      runs: Number(m[1]),
      wickets: m[2] === undefined ? 10 : Number(m[2]),
      declared: !!m[3],
      balls: m[4] === undefined ? null : Number(m[4]) * 6 + Number(m[5] || 0),
      totalBalls: m[6] ? Number(m[6]) * 6 : null,
      target: m[7] ? Number(m[7]) : null,
    });
  }
  return result.length <= 2 ? result : null;
}

export function confirmedResult(
  event: any,
  state: CricketState,
): { winner: number | null; label: string } | null {
  if (event.status !== 'post' || !Array.isArray(event.competitors)) return null;
  const winners = event.competitors
    .map((t: any, i: number) => (t.winner === true ? i : -1))
    .filter((i: number) => i >= 0);
  const text = [event.fullStatus?.longSummary, event.fullStatus?.summary, event.summary]
    .filter(Boolean)
    .join(' ');
  if (winners.length === 1 && !/\bdrawn\b|\bno result\b/i.test(text))
    return { winner: winners[0], label: 'win' };
  if (winners.length) return null;
  if (formatOf(state) === 'TEST' && /\bdrawn\b/i.test(text)) return { winner: 2, label: 'draw' };
  if (/\bno result\b|\babandoned\b|\bcancelled\b|\bcanceled\b/i.test(text))
    return { winner: null, label: 'no result' };
  // A tie is distinct from a draw; ambiguous/Super Over results require review.
  return null;
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
                reason: 'Waiting for supported cricket state',
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
            const result = confirmedResult(event, JSON.parse(existing.snapshot));
            if (!result) {
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
            const observation = `result:${result.winner}:${result.label}`;
            if (existing.fingerprint === observation)
              await tradingService.settle(
                id,
                result.winner,
                `Confirmed provider ${result.label} (test credits)`,
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
