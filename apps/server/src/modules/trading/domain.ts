import { CricketState, TradingCandleDTO } from '@moneygame/shared-types';

export const RULES = 'pooled-v1';
export const MODEL = 'cricket-baseline-v1';
export const MULTIFORMAT_MODEL = 'cricket-multiformat-baseline-v1';
export function formatOf(s: CricketState) {
  return s.format ?? (s.totalBalls === 300 ? 'ODI' : s.totalBalls === null ? 'TEST' : 'T20');
}
export function inningsEnded(s: CricketState): boolean {
  return (
    s.wickets === 10 ||
    !!s.declared ||
    (s.totalBalls !== null && s.balls >= s.totalBalls) ||
    (s.target !== null && s.runs >= s.target)
  );
}
export const LIMIT = 10_000_000; // credit tenths / nominal paise per account
export const ENTRY_PROBABILITY_LIMIT = 900; // 90.0% on the published 0..1000 price scale
export function outcomePrice(q: { price0: number; priceDraw?: number }, outcome: number): number {
  return outcome === 0 ? q.price0 : outcome === 2 ? (q.priceDraw ?? 0) : 1000 - q.price0 - (q.priceDraw ?? 0);
}
export function entryClosed(price0: number, priceDraw = 0): boolean {
  return Math.max(price0, 1000 - price0 - priceDraw, priceDraw) > ENTRY_PROBABILITY_LIMIT;
}
export function assertEntryAllowed(price0: number, priceDraw = 0): void {
  if (entryClosed(price0, priceDraw))
    throw new TradingError(
      'ENTRY_CLOSED',
      'New buys and funding are paused while any outcome is above 90% probability. Existing positions can still exit at a valid quote.',
      409,
    );
}
export class TradingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function integer(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new TradingError('INVALID_INPUT', `${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}
export function validateState(s: CricketState): CricketState {
  if (!s || typeof s !== 'object') throw new TradingError('INVALID_STATE', 'Missing cricket state');
  const format = formatOf(s);
  if (!['T20', 'ODI', 'TEST'].includes(format)) throw new TradingError('INVALID_STATE', 'Unsupported format');
  integer(s.innings, 1, format === 'TEST' ? 4 : 2, 'Innings');
  integer(s.batting, 0, 1, 'Batting team');
  if (format === 'TEST') {
    integer(s.day, 1, 6, 'Match day');
    integer(s.scheduledDays, 1, 6, 'Scheduled days');
    integer(s.session, 1, 3, 'Session');
    if (s.day! > s.scheduledDays!) throw new TradingError('INVALID_STATE', 'Inconsistent match day');
    if (
      s.totalBalls !== null ||
      !s.teamRuns ||
      !s.inningsPlayed ||
      s.teamRuns.length !== 2 ||
      s.inningsPlayed.length !== 2
    )
      throw new TradingError('INVALID_STATE', 'Test innings require aggregate scores and no ball limit');
    s.teamRuns.forEach((n) => integer(n, 0, 4000, 'Aggregate runs'));
    s.inningsPlayed.forEach((n) => integer(n, 0, 2, 'Innings played'));
    if (
      s.inningsPlayed[0] + s.inningsPlayed[1] !== s.innings ||
      !s.inningsPlayed[s.batting] ||
      s.teamRuns[s.batting] < s.runs
    )
      throw new TradingError('INVALID_STATE', 'Inconsistent Test innings');
    if (s.innings === 4) integer(s.target, 1, 4000, 'Target');
    else if (s.target !== null)
      throw new TradingError('INVALID_STATE', 'Target applies only to the fourth Test innings');
  } else if (s.totalBalls !== (format === 'ODI' ? 300 : 120)) {
    throw new TradingError('INVALID_STATE', 'Reduced or inconsistent innings length');
  }
  integer(s.balls, 0, s.totalBalls ?? 6000, 'Balls');
  integer(s.runs, 0, 2000, 'Runs');
  integer(s.wickets, 0, 10, 'Wickets');
  if (format !== 'TEST' && s.innings === 2) integer(s.target, 1, 2000, 'Target');
  return s;
}

// Experimental deterministic baseline used by the live markets. This is not
// calibrated odds. Runs, wickets and remaining opportunities affect the estimate;
// wall-clock time and user order flow do not. No random tick noise.
function decisiveProbability(s: CricketState): number {
  validateState(s);
  const format = formatOf(s);
  if (format === 'TEST') {
    // Relative team strength, before reserving probability for a draw below.
    const wickets = 10 - s.wickets;
    if (s.innings === 4) {
      const needed = s.target! - s.runs;
      const chance =
        needed <= 0
          ? 1
          : wickets === 0
            ? 0
            : 1 / (1 + Math.exp((needed - wickets * 22) / Math.max(12, Math.sqrt(wickets) * 22)));
      return s.batting === 0 ? chance : 1 - chance;
    }
    const projected = s.teamRuns!.map(
      (runs, team) =>
        runs + (2 - s.inningsPlayed![team]) * 250 + (team === s.batting && !s.declared ? wickets * 22 : 0),
    );
    return 1 / (1 + Math.exp(-(projected[0] - projected[1]) / (120 + (4 - s.innings) * 25)));
  }
  const remaining = s.totalBalls! - s.balls;
  let battingChance: number;
  if (s.innings === 2) {
    if (s.runs >= s.target!) battingChance = 1;
    else if (remaining === 0 || s.wickets === 10) battingChance = 0;
    else {
      const resources = (10 - s.wickets) / 10;
      const rate = format === 'ODI' ? 0.65 + 0.45 * resources : 1.05 + 0.65 * resources;
      const expected = remaining * rate;
      const deviation = Math.max(2, Math.sqrt(remaining) * (1.8 + resources));
      battingChance = 1 / (1 + Math.exp((s.target! - s.runs - expected) / deviation));
    }
  } else {
    const resourceRate =
      format === 'ODI' ? 0.65 + 0.45 * ((10 - s.wickets) / 10) : 1.05 + 0.65 * ((10 - s.wickets) / 10);
    const projected = s.runs + (s.wickets === 10 ? 0 : remaining * resourceRate);
    const par = s.totalBalls! * (format === 'ODI' ? 0.95 : 1.45);
    battingChance = 1 / (1 + Math.exp(-(projected - par) / (format === 'ODI' ? 40 : 24)));
  }
  return s.batting === 0 ? battingChance : 1 - battingChance;
}
export function probabilities(s: CricketState): [number, number, number] {
  const team0 = decisiveProbability(s);
  if (formatOf(s) !== 'TEST') return [team0, 1 - team0, 0];
  // Experimental heuristic: source day/session and remaining wickets, not an
  // invented fixed ball limit for Test innings. No wall-clock decay during breaks.
  const remainingSessions = (s.scheduledDays! - s.day!) * 3 + (3 - s.session!) + 0.5;
  const wickets = 10 - s.wickets;
  const sessionsNeeded =
    s.innings === 4
      ? Math.min(Math.max(0, s.target! - s.runs) / 75, wickets / 4)
      : ((4 - s.innings) * 10 + wickets) / 4;
  const decisiveEnd = s.innings === 4 && (s.runs >= s.target! || wickets === 0);
  const draw = decisiveEnd
    ? 0
    : Math.max(0.02, Math.min(0.98, 1 / (1 + Math.exp((remainingSessions - sessionsNeeded) * 0.7))));
  return [team0 * (1 - draw), (1 - team0) * (1 - draw), draw];
}
export function probability(s: CricketState): number {
  return probabilities(s)[0];
}
export function prices(s: CricketState): { price0: number; priceDraw: number } {
  const p = probabilities(s);
  if (formatOf(s) !== 'TEST')
    return {
      price0: Math.max(1, Math.min(999, Math.round(p[0] * 1000))),
      priceDraw: 0,
    };
  // One unit per outcome plus largest-remainder rounding preserves sum = 1000.
  const raw = p.map((v) => v * 997),
    result = raw.map((v) => 1 + Math.floor(v));
  const ranked = [0, 1, 2].sort((a, b) => (raw[b] % 1) - (raw[a] % 1) || a - b);
  const remainder = 1000 - result.reduce((sum, v) => sum + v, 0);
  for (let i = 0; i < remainder; i++) result[ranked[i]]++;
  return { price0: result[0], priceDraw: result[2] };
}
export function price(s: CricketState): number {
  return prices(s).price0;
}
export function pollInterval(s: CricketState | null): number {
  if (!s || formatOf(s) !== 'T20') return 60000;
  const remaining = s.totalBalls! - s.balls;
  return remaining > 0 && remaining <= 18 && s.wickets < 10 && !(s.innings === 2 && s.runs >= s.target!)
    ? 5000
    : 60000;
}

export function automaticCandleInterval(s: CricketState): 'over' | '1m' {
  return formatOf(s) === 'T20' && s.totalBalls! - s.balls <= 18 ? '1m' : 'over';
}

export function allocate(accounts: { id: string; deposit: number; balance: number }[], voided = false) {
  const rows = accounts.map((a) => {
    integer(a.deposit, 0, LIMIT, 'Deposit');
    integer(a.balance, 0, 2_000_000_000, 'Balance');
    return {
      ...a,
      gain: Math.max(0, a.balance - a.deposit),
      loss: Math.max(0, a.deposit - a.balance),
      principal: Math.min(a.deposit, a.balance),
      reward: 0,
      payout: 0,
    };
  });
  const gains = rows.reduce((n, a) => n + BigInt(a.gain), 0n);
  const losses = rows.reduce((n, a) => n + BigInt(a.loss), 0n);
  if (voided || gains === 0n)
    return rows.map((a) => ({ ...a, loss: 0, principal: a.deposit, payout: a.deposit }));
  for (const a of rows) a.reward = Number((losses * BigInt(a.gain)) / gains);
  let remainder = Number(losses - rows.reduce((n, a) => n + BigInt(a.reward), 0n));
  const ranked = [...rows].sort((a, b) => {
    const ar = (losses * BigInt(a.gain)) % gains,
      br = (losses * BigInt(b.gain)) % gains;
    return ar === br ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : ar > br ? -1 : 1;
  });
  for (const a of ranked) if (remainder-- > 0) a.reward++;
  return rows.map((a) => ({ ...a, payout: a.principal + a.reward }));
}

export function candles(
  quotes: {
    price0: number;
    priceDraw?: number;
    publishedAt: Date;
    snapshot: string;
  }[],
  outcome: number,
  interval: string,
  executions: { createdAt: Date; quantity: number }[] = [],
): TradingCandleDTO[] {
  if (!['1m', '5m', '15m', 'over'].includes(interval))
    throw new TradingError('INVALID_INTERVAL', 'Unsupported chart interval');
  const groups = new Map<string, TradingCandleDTO>();
  const seconds = interval === '5m' ? 300 : interval === '15m' ? 900 : 60;
  for (const q of quotes) {
    const state: CricketState = JSON.parse(q.snapshot);
    const time = Math.floor(q.publishedAt.getTime() / 1000);
    const bucket = Math.floor(time / seconds) * seconds;
    const over = Math.floor(Math.max(0, state.balls - 1) / 6) + 1;
    const key = interval === 'over' ? `${state.innings}:${over}` : String(bucket);
    const value = outcomePrice(q, outcome) / 10;
    const existing = groups.get(key);
    if (existing) {
      existing.high = Math.max(existing.high, value);
      existing.low = Math.min(existing.low, value);
      existing.close = value;
      existing.quotes++;
    } else
      groups.set(key, {
        time: interval === 'over' ? time : bucket,
        open: value,
        high: value,
        low: value,
        close: value,
        quotes: 1,
        volume: 0,
        label: interval === 'over' ? `Innings ${state.innings}, over ${over} (sampled)` : '',
      });
  }
  const result = [...groups.values()].sort((a, b) => a.time - b.time);
  for (const e of executions) {
    const time = Math.floor(e.createdAt.getTime() / 1000);
    const c =
      interval === 'over'
        ? [...result].reverse().find((c) => c.time <= time)
        : groups.get(String(Math.floor(time / seconds) * seconds));
    if (c) c.volume += e.quantity;
  }
  return result;
}

// Source-specific score parser. 6.6 and 7.0 both represent 42 legal balls.
export function parseScore(score: unknown) {
  if (typeof score !== 'string') return null;
  const m = /^(\d+)(?:\/(\d+))?\s*\((\d+)(?:\.(\d))?(?:\/(\d+))?\s*ov(?:,\s*target\s+(\d+))?\)$/.exec(
    score.trim(),
  );
  if (!m || Number(m[4] || 0) > 6) return null;
  return {
    runs: Number(m[1]),
    wickets: m[2] ? Number(m[2]) : 10,
    balls: Number(m[3]) * 6 + Number(m[4] || 0),
    totalBalls: m[5] ? Number(m[5]) * 6 : null,
    target: m[6] ? Number(m[6]) : null,
  };
}
