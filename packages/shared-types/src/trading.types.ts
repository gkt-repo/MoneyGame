// Money/credit fields use integer credit tenths (one unit = nominal one paise).
// Derived averagePrice can be fractional; candle OHLC uses displayed credits.
export type TradingStatus = 'OPEN' | 'SUSPENDED' | 'SETTLED' | 'VOIDED';
export type TradingSide = 'BUY' | 'SELL';
export type TradingOutcome = 0 | 1;
export interface CricketState {
  innings: 1 | 2;
  batting: TradingOutcome;
  runs: number;
  wickets: number;
  balls: number;
  totalBalls: number;
  target: number | null;
  description: string;
}
export interface TradingQuoteDTO {
  id: string;
  sequence: number;
  price0: number;
  publishedAt: string;
  expiresAt: string;
  state: CricketState;
}
export interface TradingMarketDTO {
  id: string;
  title: string;
  team0: string;
  team1: string;
  source: string;
  mode: 'TEST' | 'CASH';
  status: TradingStatus;
  // Either team's quoted probability is above 90%; exits still require a fresh OPEN quote.
  entryClosed: boolean;
  reason: string;
  rulesVersion: string;
  modelVersion: string;
  quote: TradingQuoteDTO | null;
  updatedAt: string;
  feedReceivedAt: string | null;
  snapshotChangedAt: string | null;
  pollingMs: number;
  winner: number | null;
  isSimulation: boolean;
}
export interface TradingPositionDTO {
  outcome: TradingOutcome;
  quantity: number;
  cost: number;
  averagePrice: number;
  value: number;
  unrealized: number;
}
export interface TradingAccountDTO {
  deposit: number;
  balance: number;
  equity: number;
  net: number;
  realized: number;
  positions: TradingPositionDTO[];
  receipt: TradingReceipt | null;
}
export interface TradingReceipt {
  deposit: number;
  finalBalance: number;
  gain: number;
  loss: number;
  principal: number;
  reward: number;
  payout: number;
  reason: string;
  settledAt: string;
  mode: 'TEST' | 'CASH';
}
export interface TradingExecutionDTO {
  id: string;
  side: TradingSide;
  outcome: TradingOutcome;
  quantity: number;
  price: number;
  total: number;
  createdAt: string;
}
export interface TradingPoolDTO {
  participants: number;
  deposits: number;
  losses: number;
  gains: number;
  estimatedReward: number;
  estimatedPrincipal: number;
  provisional: boolean;
}
export interface TradingCandleDTO {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  quotes: number;
  volume: number;
  label: string;
}
export interface TradingSnapshotDTO {
  market: TradingMarketDTO;
  account: TradingAccountDTO;
  pool: TradingPoolDTO;
  executions: TradingExecutionDTO[];
}
export interface TradingOrderInput {
  requestId: string;
  quoteId: string;
  side: TradingSide;
  outcome: TradingOutcome;
  quantity: number;
}
