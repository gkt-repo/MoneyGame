import { CricketState, TradingCandleDTO } from '@moneygame/shared-types';

export const RULES = 'pooled-v1';
export const MODEL = 'cricket-baseline-v1';
export const LIMIT = 10_000_000; // credit tenths / nominal paise per account
export const ENTRY_PROBABILITY_LIMIT = 900; // 90.0% on the published 0..1000 price scale
export function entryClosed(price0: number): boolean {
  return Math.max(price0, 1000 - price0) > ENTRY_PROBABILITY_LIMIT;
}
export function assertEntryAllowed(price0: number): void {
  if (entryClosed(price0))
    throw new TradingError(
      'ENTRY_CLOSED',
      'New buys and funding are paused while either team is above 90% win probability. Existing positions can still exit at a valid quote.',
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
  integer(s.innings, 1, 2, 'Innings');
  integer(s.batting, 0, 1, 'Batting team');
  integer(s.totalBalls, 6, 120, 'Innings length');
  integer(s.balls, 0, s.totalBalls, 'Balls');
  integer(s.runs, 0, 1000, 'Runs');
  integer(s.wickets, 0, 10, 'Wickets');
  if (s.innings === 2) integer(s.target, 1, 1000, 'Target');
  return s;
}

// Experimental deterministic baseline, deliberately not approved for cash
// execution. Runs, wickets and remaining opportunities affect the estimate;
// wall-clock time and user order flow do not. No random tick noise.
export function probability(s: CricketState): number {
  validateState(s);
  const remaining = s.totalBalls - s.balls;
  let battingChance: number;
  if (s.innings === 2) {
    if (s.runs >= s.target!) battingChance = 1;
    else if (remaining === 0 || s.wickets === 10) battingChance = 0;
    else {
      const resources = (10 - s.wickets) / 10;
      const rate = 1.05 + 0.65 * resources;
      const expected = remaining * rate;
      const deviation = Math.max(2, Math.sqrt(remaining) * (1.8 + resources));
      battingChance = 1 / (1 + Math.exp((s.target! - s.runs - expected) / deviation));
    }
  } else {
    const resourceRate = 1.05 + 0.65 * ((10 - s.wickets) / 10);
    const projected = s.runs + (s.wickets === 10 ? 0 : remaining * resourceRate);
    const par = s.totalBalls * 1.45;
    battingChance = 1 / (1 + Math.exp(-(projected - par) / 24));
  }
  return s.batting === 0 ? battingChance : 1 - battingChance;
}
export function price(s: CricketState): number {
  return Math.max(1, Math.min(999, Math.round(probability(s) * 1000)));
}
export function pollInterval(s: CricketState | null): number {
  if (!s) return 60000;
  const remaining = s.totalBalls - s.balls;
  return remaining > 0 && remaining <= 18 && s.wickets < 10 && !(s.innings === 2 && s.runs >= s.target!)
    ? 5000
    : 60000;
}

export function automaticCandleInterval(s: CricketState): 'over' | '1m' {
  return s.totalBalls - s.balls <= 18 ? '1m' : 'over';
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
  quotes: { price0: number; publishedAt: Date; snapshot: string }[],
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
    const value = (outcome === 0 ? q.price0 : 1000 - q.price0) / 10;
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
