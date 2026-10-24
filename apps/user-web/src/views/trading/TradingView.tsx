import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  ColorType,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from 'lightweight-charts';
import {
  TradingMarketDTO,
  TradingSnapshotDTO,
  TradingCandleDTO,
  TradingOrderInput,
  TradingExecutionDTO,
} from '@moneygame/shared-types';
import { userApi } from '../../services/api';
import { connectSocket } from '../../services/socket';
import './trading.css';

const credits = (n: number) => (n / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
const rupees = (n: number) =>
  `₹${(n / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clock = (s: string) => new Date(s).toLocaleTimeString();
const requestId = () => crypto.randomUUID();

function PriceChart({
  data,
  line,
  average,
  trades,
  outcome,
}: {
  data: TradingCandleDTO[];
  line: boolean;
  average: number;
  trades: TradingExecutionDTO[];
  outcome: number;
}) {
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<IChartApi | null>(null),
    series = useRef<ISeriesApi<any> | null>(null);
  const first = useRef(true),
    [hover, setHover] = useState('');
  useEffect(() => {
    if (!host.current) return;
    const c = createChart(host.current, {
      autoSize: true,
      height: 340,
      layout: {
        background: { type: ColorType.Solid, color: '#101c2b' },
        textColor: '#9eb1c7',
        attributionLogo: true,
      },
      grid: { vertLines: { color: '#1d2b3d' }, horzLines: { color: '#1d2b3d' } },
      rightPriceScale: { borderColor: '#28394e' },
      timeScale: { timeVisible: true, secondsVisible: true, borderColor: '#28394e' },
      localization: { timeFormatter: (t: any) => new Date(Number(t) * 1000).toLocaleTimeString() },
    });
    const s = line
      ? c.addSeries(LineSeries, { color: '#42dfb6', lineWidth: 2 })
      : c.addSeries(CandlestickSeries, {
          upColor: '#42dfb6',
          downColor: '#fb8293',
          wickUpColor: '#42dfb6',
          wickDownColor: '#fb8293',
          borderVisible: false,
        });
    s.applyOptions({ priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
    chart.current = c;
    series.current = s;
    first.current = true;
    c.subscribeCrosshairMove((param) => {
      const d: any = param.seriesData.get(s);
      setHover(
        d ? ('close' in d ? `O ${d.open}  H ${d.high}  L ${d.low}  C ${d.close}` : `Price ${d.value}`) : '',
      );
    });
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
    };
  }, [line]);
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    s.setData(
      data.map((c) =>
        line
          ? { time: c.time as UTCTimestamp, value: c.close }
          : { time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close },
      ),
    );
    if (first.current && data.length) {
      chart.current?.timeScale().fitContent();
      first.current = false;
    }
    const priceLine =
      average > 0
        ? s.createPriceLine({
            price: average / 10,
            color: '#f3c969',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'Your entry',
          })
        : null;
    const markers = createSeriesMarkers(
      s,
      trades
        .filter((t) => t.outcome === outcome)
        .map((t) => ({
          time: Math.floor(new Date(t.createdAt).getTime() / 1000) as UTCTimestamp,
          position: t.side === 'BUY' ? ('belowBar' as const) : ('aboveBar' as const),
          color: t.side === 'BUY' ? '#42dfb6' : '#fb8293',
          shape: t.side === 'BUY' ? ('arrowUp' as const) : ('arrowDown' as const),
          text: `${t.side} ${t.quantity}`,
        }))
        .sort((a, b) => Number(a.time) - Number(b.time)),
    );
    return () => {
      if (series.current === s) {
        markers.detach();
        if (priceLine) s.removePriceLine(priceLine);
      }
    };
  }, [data, line, average, trades, outcome]);
  return (
    <>
      <div className="ct-chart-meta">
        <span>{hover || 'Model price · credits per share'}</span>
        <button onClick={() => chart.current?.timeScale().fitContent()}>Reset view</button>
      </div>
      <div
        ref={host}
        style={{ height: 340, minWidth: 0 }}
        role="img"
        aria-label={`Sampled price chart. ${data.length} candles. Latest price ${data.at(-1)?.close ?? 'unavailable'} credits.`}
      />
      {!data.length && <p className="ct-muted">Waiting for the first price snapshot.</p>}
      <p className="ct-footnote">
        Drag to inspect history · scroll to zoom · sampled prices, not guaranteed delivery history. Charts by{' '}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView
        </a>
        .
      </p>
    </>
  );
}

type Pending = { path: string; body: Record<string, unknown>; label: string };
export function TradingView({ userId }: { userId: string }) {
  const [markets, setMarkets] = useState<TradingMarketDTO[]>([]),
    [marketId, setMarketId] = useState('');
  const [snapshot, setSnapshot] = useState<TradingSnapshotDTO | null>(null),
    [bars, setBars] = useState<TradingCandleDTO[]>([]);
  const [outcome, setOutcome] = useState<0 | 1>(0),
    [interval, setIntervalValue] = useState('1m'),
    [line, setLine] = useState(false);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY'),
    [quantity, setQuantity] = useState('10'),
    [funding, setFunding] = useState('1000');
  const [tab, setTab] = useState('Positions'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null),
    [confirm, setConfirm] = useState<Pending | null>(null);
  const [now, setNow] = useState(Date.now()),
    [loading, setLoading] = useState(true);
  const epoch = useRef(0),
    inflight = useRef(false),
    requestBusy = useRef(false);
  const storageKey = `crictrade-pending:${userId}`;
  useEffect(() => {
    try {
      const p = sessionStorage.getItem(storageKey);
      if (p) setPending(JSON.parse(p));
    } catch {}
  }, [storageKey]);
  const loadMarkets = useCallback(async () => {
    try {
      const list = await userApi.trading<TradingMarketDTO[]>('/markets');
      setMarkets(list);
      setMarketId((id) => id || list.find((m) => m.status === 'OPEN')?.id || list[0]?.id || '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  const refresh = useCallback(async () => {
    if (!marketId || inflight.current) return;
    inflight.current = true;
    const current = epoch.current;
    try {
      const [s, c] = await Promise.all([
        userApi.trading<TradingSnapshotDTO>(`/markets/${marketId}`),
        userApi.trading<TradingCandleDTO[]>(
          `/markets/${marketId}/candles?outcome=${outcome}&interval=${interval}`,
        ),
      ]);
      if (current === epoch.current) {
        setSnapshot(s);
        setBars(c);
      }
    } catch (e: any) {
      if (current === epoch.current) setError(e.message);
    } finally {
      inflight.current = false;
    }
  }, [marketId, outcome, interval]);
  useEffect(() => {
    void loadMarkets();
    const timer = window.setInterval(() => void loadMarkets(), 30000);
    return () => clearInterval(timer);
  }, [loadMarkets]);
  useEffect(() => {
    epoch.current++;
    setSnapshot(null);
    setBars([]);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      epoch.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    const s = connectSocket();
    const update = (e: { marketId: string }) => {
      if (e.marketId === marketId) void refresh();
    };
    s.on('trading_market_updated', update);
    s.on('trading_account_updated', update);
    s.on('connect', () => void refresh());
    return () => {
      s.disconnect();
    };
  }, [marketId, refresh]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  async function execute(p: Pending) {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setBusy(true);
    setError('');
    setConfirm(null);
    setPending(p);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(p));
      await userApi.trading(p.path, p.body);
      setNotice(`${p.label} completed.`);
      setPending(null);
      sessionStorage.removeItem(storageKey);
      await refresh();
    } catch (e: any) {
      setError(e.message);
      if (e.status && e.status < 500) {
        setPending(null);
        sessionStorage.removeItem(storageKey);
      }
      await refresh();
    } finally {
      setBusy(false);
      requestBusy.current = false;
    }
  }
  const m = snapshot?.market,
    q = m?.quote,
    a = snapshot?.account;
  const selectedPrice = q ? (outcome === 0 ? q.price0 : 1000 - q.price0) : 0;
  const position = a?.positions.find((p) => p.outcome === outcome);
  const count = Number(quantity),
    total = count * selectedPrice;
  const open = m?.status === 'OPEN' && !!q && new Date(q.expiresAt).getTime() > now;
  const maximum =
    side === 'BUY' ? Math.floor((a?.balance ?? 0) / Math.max(selectedPrice, 1)) : (position?.quantity ?? 0);
  const team = outcome === 0 ? m?.team0 : m?.team1;
  const valid = Number.isSafeInteger(count) && count > 0 && count <= maximum;
  function previewTrade() {
    if (!q || !m || !valid) return;
    const body: TradingOrderInput = { requestId: requestId(), quoteId: q.id, outcome, side, quantity: count };
    setConfirm({
      path: `/markets/${m.id}/orders`,
      body: { ...body },
      label: `${side} ${count} ${team} shares for ${credits(total)} credits`,
    });
  }
  return (
    <section className="crictrade">
      <header className="ct-heading">
        <div>
          <span className="ct-eyebrow">MONEYGAME / CRICKET MARKETS</span>
          <h1>
            CricTrade<span>●</span>
          </h1>
          <p>Read the match. Trade the probability.</p>
        </div>
        <button
          onClick={() => {
            void loadMarkets();
            void refresh();
          }}
        >
          ↻ Refresh
        </button>
      </header>
      <div className="ct-mode">
        TEST CREDITS{' '}
        <span>Live scores and simulations · no cash wallet deductions · experimental probability model</span>
      </div>
      {error && (
        <div role="alert" className="ct-error">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="ct-notice">
          {notice}
        </div>
      )}
      {pending && (
        <div className="ct-error">
          A request has not been confirmed. Retry the same request to avoid a duplicate.{' '}
          <button disabled={busy} onClick={() => void execute(pending)}>
            Retry {pending.label}
          </button>
        </div>
      )}
      <div className="ct-market-list">
        {markets.map((item) => (
          <button
            key={item.id}
            className={marketId === item.id ? 'selected' : ''}
            onClick={() => {
              setMarketId(item.id);
              setOutcome(0);
              setError('');
              setNotice('');
            }}
          >
            <strong>{item.title}</strong>
            <small>
              {item.source === 'SIMULATION' ? 'SIMULATION' : 'ESPN SNAPSHOT'} · {item.status}
            </small>
          </button>
        ))}
      </div>
      {!markets.length && (
        <div className="ct-panel">
          <h2>{loading ? 'Loading matches…' : 'No supported matches yet'}</h2>
          <p>
            The server discovers supported T20 scores automatically. A simulation is created on server
            startup.
          </p>
        </div>
      )}
      {marketId && !snapshot && <p>Loading market…</p>}
      {m && a && (
        <>
          <div className="ct-score">
            <div>
              <span className={open ? 'ct-live' : 'ct-muted'}>
                {open ? '● OPEN' : m.status === 'OPEN' ? 'QUOTE EXPIRED' : m.status}
              </span>
              <h2>{m.title}</h2>
              <p>{q?.state.description || m.reason}</p>
            </div>
            <div className="ct-score-right">
              {q && (
                <>
                  <strong>
                    {q.state.runs}/{q.state.wickets}{' '}
                    <small>
                      {Math.floor(q.state.balls / 6)}.{q.state.balls % 6} overs
                    </small>
                  </strong>
                  <span>
                    {q.state.target
                      ? `Need ${Math.max(0, q.state.target - q.state.runs)} from ${q.state.totalBalls - q.state.balls} balls`
                      : `Innings ${q.state.innings}`}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="ct-workspace">
            <div className="ct-panel ct-chart-panel">
              <div className="ct-team-cards">
                {[m.team0, m.team1].map((name, i) => (
                  <button
                    key={i}
                    className={outcome === i ? 'selected' : ''}
                    onClick={() => setOutcome(i as 0 | 1)}
                  >
                    <span>{name}</span>
                    <strong>
                      {q ? credits(i === 0 ? q.price0 : 1000 - q.price0) : '—'} <small>cr</small>
                    </strong>
                    <small>
                      {q
                        ? `${((i === 0 ? q.price0 : 1000 - q.price0) / 10).toFixed(1)}% estimated chance`
                        : 'Waiting for quote'}
                    </small>
                  </button>
                ))}
              </div>
              <div className="ct-chart-controls">
                <div>
                  <button className={!line ? 'selected' : ''} onClick={() => setLine(false)}>
                    Candles
                  </button>
                  <button className={line ? 'selected' : ''} onClick={() => setLine(true)}>
                    Line
                  </button>
                </div>
                <div>
                  {['1m', '5m', '15m', 'over'].map((v) => (
                    <button
                      className={interval === v ? 'selected' : ''}
                      key={v}
                      onClick={() => setIntervalValue(v)}
                    >
                      {v === 'over' ? 'By over' : v}
                    </button>
                  ))}
                </div>
              </div>
              <PriceChart
                key={`${marketId}:${outcome}:${interval}`}
                data={bars}
                line={line}
                average={position?.averagePrice ?? 0}
                trades={snapshot.executions}
                outcome={outcome}
              />
              <div className="ct-feed">
                <span>Quote {q ? clock(q.publishedAt) : '—'}</span>
                <span>Feed checked {m.feedReceivedAt ? clock(m.feedReceivedAt) : '—'}</span>
                <span>
                  {m.isSimulation
                    ? 'Simulation clock'
                    : `Checks every ${m.pollingMs / 1000}s · source delay unknown`}
                </span>
              </div>
            </div>
            <aside className="ct-panel ct-ticket">
              <span className="ct-eyebrow">AVAILABLE MATCH CREDITS</span>
              <h2>
                {credits(a.balance)} <small>cr</small>
              </h2>
              <p className="ct-muted">{rupees(a.deposit)} nominal test funding</p>
              <label>
                Add test funding (₹ equivalent)
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={funding}
                  onChange={(e) => setFunding(e.target.value)}
                />
              </label>
              <button
                disabled={
                  !open ||
                  busy ||
                  !!pending ||
                  !Number.isFinite(Number(funding)) ||
                  Number(funding) < 1 ||
                  Number(funding) > 100000
                }
                onClick={() =>
                  setConfirm({
                    path: `/markets/${m.id}/fund`,
                    body: { requestId: requestId(), amount: Math.round(Number(funding) * 100) },
                    label: `Add ${credits(Math.round(Number(funding) * 100))} test credits`,
                  })
                }
              >
                Add test credits
              </button>
              <hr />
              <div className="ct-switch">
                {(['BUY', 'SELL'] as const).map((v) => (
                  <button className={side === v ? 'selected' : ''} key={v} onClick={() => setSide(v)}>
                    {v}
                  </button>
                ))}
              </div>
              <h3>{team}</h3>
              <label>
                Share quantity
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>
              <div className="ct-shortcuts">
                {[0.25, 0.5, 0.75, 1].map((v) => (
                  <button key={v} onClick={() => setQuantity(String(Math.floor(maximum * v)))}>
                    {v === 1 ? 'Max' : `${v * 100}%`}
                  </button>
                ))}
              </div>
              <dl>
                <dt>Price / share</dt>
                <dd>{credits(selectedPrice)} cr</dd>
                <dt>{side === 'BUY' ? 'Cost' : 'Proceeds'}</dt>
                <dd>{Number.isFinite(total) ? credits(total) : '—'} cr</dd>
                <dt>Owned shares</dt>
                <dd>{position?.quantity ?? 0}</dd>
              </dl>
              <button
                className={`ct-submit ${side === 'SELL' ? 'sell' : ''}`}
                disabled={!open || !valid || busy || !!pending}
                onClick={previewTrade}
              >
                {open ? `${side === 'BUY' ? 'Buy' : 'Sell'} ${team}` : 'Trading paused'}
              </button>
              <p className="ct-footnote">
                Selling fixes your credit result. Cash-equivalent rewards depend on the final loss pool. Test
                credits cannot be withdrawn.
              </p>
            </aside>
          </div>
          <div className="ct-stats">
            <div>
              <span>Position value</span>
              <strong>{credits(a.equity - a.balance)} cr</strong>
            </div>
            <div>
              <span>Net trading result</span>
              <strong className={a.net >= 0 ? 'positive' : 'negative'}>
                {a.net >= 0 ? '+' : ''}
                {credits(a.net)} cr
              </strong>
            </div>
            <div>
              <span>Principal estimate</span>
              <strong>{rupees(snapshot.pool.estimatedPrincipal)}</strong>
            </div>
            <div>
              <span>Provisional reward</span>
              <strong>{rupees(snapshot.pool.estimatedReward)}</strong>
            </div>
          </div>
          <div className="ct-panel">
            <div className="ct-tabs">
              {['Positions', 'History', 'Pool & payout', 'Rules'].map((t) => (
                <button className={tab === t ? 'selected' : ''} key={t} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </div>
            {tab === 'Positions' &&
              (a.positions.some((p) => p.quantity) ? (
                <div className="ct-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th>Shares</th>
                        <th>Entry / cr</th>
                        <th>Value / cr</th>
                        <th>Unrealized / cr</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {a.positions
                        .filter((p) => p.quantity)
                        .map((p) => (
                          <tr key={p.outcome}>
                            <td>{p.outcome === 0 ? m.team0 : m.team1}</td>
                            <td>{p.quantity}</td>
                            <td>{credits(p.averagePrice)}</td>
                            <td>{credits(p.value)}</td>
                            <td className={p.unrealized >= 0 ? 'positive' : 'negative'}>
                              {credits(p.unrealized)}
                            </td>
                            <td>
                              <button
                                onClick={() => {
                                  setOutcome(p.outcome);
                                  setSide('SELL');
                                  setQuantity(String(p.quantity));
                                }}
                              >
                                Sell
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="ct-muted">No open positions. Choose a team and buy shares to begin.</p>
              ))}
            {tab === 'History' && (
              <div className="ct-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Team</th>
                      <th>Shares</th>
                      <th>Price / cr</th>
                      <th>Total / cr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.executions.map((e) => (
                      <tr key={e.id}>
                        <td>{clock(e.createdAt)}</td>
                        <td>{e.side}</td>
                        <td>{e.outcome === 0 ? m.team0 : m.team1}</td>
                        <td>{e.quantity}</td>
                        <td>{credits(e.price)}</td>
                        <td>{credits(e.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!snapshot.executions.length && <p>No trades yet.</p>}
                <p className="ct-footnote">Most recent 100 trades.</p>
              </div>
            )}
            {tab === 'Pool & payout' && (
              <>
                <dl>
                  <dt>Participants</dt>
                  <dd>{snapshot.pool.participants}</dd>
                  <dt>Total test funding</dt>
                  <dd>{rupees(snapshot.pool.deposits)}</dd>
                  <dt>Loss pool {snapshot.pool.provisional ? '(estimated)' : ''}</dt>
                  <dd>{rupees(snapshot.pool.losses)}</dd>
                  <dt>Positive trading credits</dt>
                  <dd>{credits(snapshot.pool.gains)}</dd>
                </dl>
                <p>
                  Reward = your positive net credits ÷ all positive net credits × loss pool. Values remain
                  provisional until settlement.
                </p>
              </>
            )}
            {tab === 'Rules' && (
              <div className="ct-rules">
                <p>
                  ₹1 equivalent = 10 match credits. Your full net loss contributes to the pool, capped at your
                  match funding. Remaining principal returns at the original conversion.
                </p>
                <p>
                  Winners divide the entire loss pool by positive net credit profit. If everyone profits, cash
                  profit is zero. If nobody has a positive result, deposits are refunded. Voided matches
                  refund deposits. No fees in this version.
                </p>
                <p>
                  Open winning shares close at 100 credits; losing shares at zero. This sets your trading
                  score, not a fixed cash payout. Funds remain locked until the match settles.
                </p>
                <p>
                  Time pressure uses balls remaining; event sensitivity depends on runs, wickets and target.
                  This experimental model is not a calibrated prediction service. ESPN snapshots can skip
                  deliveries; the chart never invents missing prices.
                </p>
                <p>
                  Simulation and live snapshot markets currently use test credits only. Rules:{' '}
                  {m.rulesVersion}.
                </p>
              </div>
            )}
            {a.receipt && (
              <div className="ct-receipt">
                <h3>Settlement receipt · {a.receipt.mode === 'TEST' ? 'test credits' : 'cash'}</h3>
                <p>{a.receipt.reason}</p>
                <dl>
                  <dt>Deposit</dt>
                  <dd>{rupees(a.receipt.deposit)}</dd>
                  <dt>Loss contribution</dt>
                  <dd>{rupees(a.receipt.loss)}</dd>
                  <dt>Principal returned</dt>
                  <dd>{rupees(a.receipt.principal)}</dd>
                  <dt>Pool reward</dt>
                  <dd>{rupees(a.receipt.reward)}</dd>
                  <dt>Total payout equivalent</dt>
                  <dd>{rupees(a.receipt.payout)}</dd>
                </dl>
                <small>
                  {new Date(a.receipt.settledAt).toLocaleString()} ·{' '}
                  {a.receipt.mode === 'TEST' ? 'No money moved in your wallet.' : 'Credited to wallet.'}
                </small>
              </div>
            )}
          </div>
        </>
      )}
      {confirm && (
        <div className="ct-modal-backdrop">
          <div
            className="ct-panel ct-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm trading request"
          >
            <h2>Confirm request</h2>
            <p>{confirm.label}</p>
            <p className="ct-muted">
              Test credits only. If the quote changes, this trade will be rejected for you to review again.
            </p>
            <div>
              <button onClick={() => setConfirm(null)}>Cancel</button>
              <button className="ct-submit" disabled={busy} onClick={() => void execute(confirm)}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
