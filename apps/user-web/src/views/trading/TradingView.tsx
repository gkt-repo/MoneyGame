import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  ColorType,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  Time,
} from 'lightweight-charts';
import {
  TradingMarketDTO,
  TradingSnapshotDTO,
  TradingCandleDTO,
  TradingExecutionDTO,
} from '@moneygame/shared-types';
import { userApi } from '../../services/api';
import { connectSocket } from '../../services/socket';
import './trading.css';

const teamCode = (name: string) =>
  ({
    India: 'IND',
    'New Zealand': 'NZ',
    Australia: 'AUS',
    England: 'ENG',
    Pakistan: 'PAK',
    'South Africa': 'SA',
    'Sri Lanka': 'SL',
    Bangladesh: 'BAN',
    Afghanistan: 'AFG',
    'West Indies': 'WI',
  })[name] ||
  (name.length <= 4
    ? name.toUpperCase()
    : name
        .split(/\s+/)
        .map((word) => word[0])
        .join('')
        .slice(0, 4)
        .toUpperCase());
const credits = (n: number) => (n / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
const rupees = (n: number) =>
  `₹${(n / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clock = (s: string) => new Date(s).toLocaleTimeString();
const requestId = () => crypto.randomUUID();

function PriceChart({
  data,
  average,
  trades,
  outcome,
}: {
  data: TradingCandleDTO[];
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
      height: 420,
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
      layout: {
        background: { type: ColorType.Solid, color: '#101c2b' },
        textColor: '#9eb1c7',
        attributionLogo: true,
      },
      grid: { vertLines: { color: '#1d2b3d' }, horzLines: { color: '#1d2b3d' } },
      rightPriceScale: { borderColor: '#28394e' },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#28394e',
        tickMarkFormatter: (time: Time) =>
          new Date(Number(time) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
      localization: { timeFormatter: (t: any) => new Date(Number(t) * 1000).toLocaleTimeString() },
    });
    const s = c.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#f87171',
      wickUpColor: '#34d399',
      wickDownColor: '#f87171',
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
  }, []);
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    s.setData(
      data.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
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
          text: `${t.side === 'BUY' ? 'Buy' : 'Exit'} ${t.quantity}`,
        }))
        .sort((a, b) => Number(a.time) - Number(b.time)),
    );
    return () => {
      if (series.current === s) {
        markers.detach();
        if (priceLine) s.removePriceLine(priceLine);
      }
    };
  }, [data, average, trades, outcome]);
  return (
    <>
      <div className="ct-chart-meta">
        <span>{hover || 'Model price · credits per share'}</span>
      </div>
      <div
        ref={host}
        style={{ height: 420, minWidth: 0 }}
        role="img"
        aria-label={`Sampled price chart. ${data.length} candles. Latest price ${data.at(-1)?.close ?? 'unavailable'} credits.`}
      />
      {!data.length && <p className="ct-muted">Waiting for the first price snapshot.</p>}
      <p className="ct-chart-hint">
        Drag price to scale vertically · drag time to scale horizontally{' '}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView
        </a>
      </p>
    </>
  );
}

type Pending = { path: string; body: Record<string, unknown>; label: string };
export function TradingView({
  userId,
  onBack,
  onWithdraw,
}: {
  userId: string;
  onBack: () => void;
  onWithdraw: () => void;
}) {
  const [markets, setMarkets] = useState<TradingMarketDTO[]>([]),
    [marketId, setMarketId] = useState('');
  const [snapshot, setSnapshot] = useState<TradingSnapshotDTO | null>(null),
    [bars, setBars] = useState<TradingCandleDTO[]>([]);
  const [outcome, setOutcome] = useState<0 | 1>(0),
    [page, setPage] = useState<'home' | 'positions'>('home');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY'),
    [quantity, setQuantity] = useState('10'),
    [funding, setFunding] = useState('1000');
  const [dialog, setDialog] = useState<'fund' | 'order' | 'rules' | 'withdraw' | null>(null),
    [orderOutcome, setOrderOutcome] = useState<0 | 1>(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
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
      setMarketId((id) => (list.some((m) => m.id === id) ? id : ''));
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
        userApi.trading<TradingCandleDTO[]>(`/markets/${marketId}/candles?outcome=${outcome}&interval=auto`),
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
  }, [marketId, outcome]);
  useEffect(() => {
    void loadMarkets();
    const timer = window.setInterval(() => void loadMarkets(), 30000);
    return () => clearInterval(timer);
  }, [loadMarkets]);
  useEffect(() => {
    epoch.current++;
    setSnapshot((previous) => (previous?.market.id === marketId ? previous : null));
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
    setNotice('');
    setDialog(null);
    setPending(p);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(p));
      await userApi.trading(p.path, p.body);
      setNotice(`${p.label}.`);
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
  const activeSnapshot = snapshot?.market.id === marketId ? snapshot : null;
  const m = activeSnapshot?.market,
    q = m?.quote,
    a = activeSnapshot?.account;
  const open = m?.status === 'OPEN' && !!q && new Date(q.expiresAt).getTime() > now;
  const priceFor = (o: number) => (q ? (o === 0 ? q.price0 : 1000 - q.price0) : 0);
  const position = a?.positions.find((p) => p.outcome === outcome);
  const orderPosition = a?.positions.find((p) => p.outcome === orderOutcome);
  const count = Number(quantity),
    orderPrice = priceFor(orderOutcome),
    total = count * orderPrice;
  const maximum =
    side === 'BUY' ? Math.floor((a?.balance ?? 0) / Math.max(1, orderPrice)) : (orderPosition?.quantity ?? 0);
  const valid = Number.isSafeInteger(count) && count > 0 && count <= maximum;
  const teamFor = (o: number) => (o === 0 ? m?.team0 : m?.team1);
  const oneMinute = !!q && q.state.totalBalls - q.state.balls <= 18;
  const positions = a?.positions.filter((p) => p.quantity > 0) ?? [];
  const signed = (n: number) => `${n > 0 ? '+' : ''}${credits(n)} cr`;
  function ticket(o: 0 | 1, exit = false) {
    setOrderOutcome(o);
    setSide(exit ? 'SELL' : 'BUY');
    setQuantity(String(exit ? (a?.positions.find((p) => p.outcome === o)?.quantity ?? 0) : 10));
    setDialog('order');
  }
  function submitOrder() {
    if (!m || !q || !valid || !open) return;
    void execute({
      path: `/markets/${m.id}/orders`,
      body: { requestId: requestId(), quoteId: q.id, outcome: orderOutcome, side, quantity: count },
      label: side === 'BUY' ? 'Position opened' : 'Position exited',
    });
  }
  return (
    <section className="crictrade">
      <header className="ct-header">
        <div className="ct-header-inner">
          <div className="ct-brand">
            <button aria-label="Back to MoneyGame" onClick={onBack}>
              ←
            </button>
            <strong>
              CricTrade<span>●</span>
            </strong>
          </div>
          <div className="ct-header-actions">
            <button
              className="ct-withdraw"
              aria-label="Withdraw"
              title="Withdraw"
              disabled={!m || busy || !!pending}
              onClick={() => setDialog('withdraw')}
            >
              <ArrowUpRight size={18} aria-hidden="true" />
              <span className="ct-withdraw-label">Withdraw</span>
            </button>
            <button
              className="ct-credit-pill"
              aria-label="Add credits"
              onClick={() => setDialog('fund')}
              disabled={!open || busy || !!pending}
            >
              <span>
                <small>Match credits</small>
                <b>
                  {credits(a?.receipt ? 0 : (a?.balance ?? 0))} <em>cr</em>
                </b>
              </span>
              <span className="ct-plus">+</span>
            </button>
          </div>
        </div>
        <nav className="ct-page-tabs" aria-label="CricTrade pages">
          <button aria-current={page === 'home' ? 'page' : undefined} onClick={() => setPage('home')}>
            Home
          </button>
          <button
            aria-current={page === 'positions' ? 'page' : undefined}
            onClick={() => setPage('positions')}
          >
            My positions{positions.length > 0 && <span>{positions.length}</span>}
          </button>
        </nav>
      </header>
      <div className="ct-content">
        {error && (
          <div role="alert" className="ct-message ct-error">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              ×
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="ct-message">
            {notice}
            <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
              ×
            </button>
          </div>
        )}
        {pending && (
          <div className="ct-message">
            Request not confirmed.{' '}
            <button disabled={busy} onClick={() => void execute(pending)}>
              Retry request
            </button>
          </div>
        )}
        <div className="ct-match-row">
          <label className="ct-match-picker">
            <span>Match</span>
            <select
              aria-label="Match"
              value={marketId}
              disabled={busy || !!pending}
              onChange={(e) => {
                setMarketId(e.target.value);
                setOutcome(0);
                setError('');
                setNotice('');
              }}
            >
              <option value="" disabled>
                Choose a match
              </option>
              {markets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <div className="ct-market-state">
            <span className={open ? 'ct-live' : ''}>
              {open ? '● Live' : (m?.status ?? (marketId ? 'Loading' : ''))}
            </span>
            {m?.mode === 'TEST' && <small>Test market</small>}
            <button
              className="ct-info"
              aria-label="Market details and rules"
              onClick={() => setDialog('rules')}
            >
              ⓘ
            </button>
          </div>
        </div>
        {!markets.length && (
          <div className="ct-empty">{loading ? 'Loading matches…' : 'No matches available yet.'}</div>
        )}
        {!!markets.length && !marketId && (
          <div className="ct-empty">
            Choose a match to add credits and trade. Credits belong only to that match.
          </div>
        )}
        {marketId && !snapshot && <div className="ct-empty">Loading market…</div>}
        {m && a && activeSnapshot && (
          <>
            {page === 'home' ? (
              <>
                <div className="ct-score">
                  <span>{q?.state.description || m.reason}</span>
                  {q && (
                    <strong>
                      {q.state.runs}/{q.state.wickets}{' '}
                      <small>
                        ({Math.floor(q.state.balls / 6)}.{q.state.balls % 6} ov)
                      </small>
                    </strong>
                  )}
                </div>
                <div className="ct-team-cards">
                  {[m.team0, m.team1].map((name, i) => (
                    <button key={i} aria-pressed={outcome === i} onClick={() => setOutcome(i as 0 | 1)}>
                      <span title={name}>{teamCode(name)}</span>
                      <strong>{q ? (priceFor(i) / 10).toFixed(2) : '—'}</strong>
                    </button>
                  ))}
                </div>
                <div className="ct-chart-panel">
                  <div className="ct-chart-title">
                    <div>
                      <strong>{teamFor(outcome)}</strong>
                      <span> / credits</span>
                    </div>
                    <span>{oneMinute ? '1 min candles' : 'Over candles'} · Auto</span>
                  </div>
                  <PriceChart
                    key={`${marketId}:${outcome}:${oneMinute ? '1m' : 'over'}`}
                    data={bars}
                    average={position?.averagePrice ?? 0}
                    trades={activeSnapshot.executions}
                    outcome={outcome}
                  />
                  <div className="ct-chart-footer">
                    <small>{q ? `Updated ${clock(q.publishedAt)}` : 'Awaiting update'}</small>
                    <button
                      className="ct-primary"
                      disabled={!open || busy || !!pending}
                      onClick={() => ticket(outcome)}
                    >
                      {open ? `Buy ${teamFor(outcome)}` : 'Trading paused'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="ct-position-heading">
                  <h1>My positions</h1>
                  <div>
                    <small>Total P&L</small>
                    <strong className={a.net > 0 ? 'ct-profit' : a.net < 0 ? 'ct-loss' : ''}>
                      {signed(a.net)}
                    </strong>
                  </div>
                </div>
                <div className="ct-position-summary">
                  <span>
                    Invested <b>{credits(positions.reduce((n, p) => n + p.cost, 0))} cr</b>
                  </span>
                  <span>
                    Current value <b>{credits(positions.reduce((n, p) => n + p.value, 0))} cr</b>
                  </span>
                  <span>
                    Realized{' '}
                    <b className={a.realized > 0 ? 'ct-profit' : a.realized < 0 ? 'ct-loss' : ''}>
                      {signed(a.realized)}
                    </b>
                  </span>
                </div>
                <div className="ct-positions">
                  {positions.length ? (
                    positions.map((p) => (
                      <article key={p.outcome} className="ct-position">
                        <div className="ct-position-main">
                          <div>
                            <h2>{teamFor(p.outcome)}</h2>
                            <small>
                              {p.quantity} shares · Avg. {credits(p.averagePrice)} cr
                            </small>
                          </div>
                          <div className="ct-position-pnl">
                            <strong
                              className={p.unrealized > 0 ? 'ct-profit' : p.unrealized < 0 ? 'ct-loss' : ''}
                            >
                              {signed(p.unrealized)}
                            </strong>
                            <small
                              className={p.unrealized > 0 ? 'ct-profit' : p.unrealized < 0 ? 'ct-loss' : ''}
                            >
                              {p.cost ? `${((p.unrealized / p.cost) * 100).toFixed(2)}%` : '0.00%'}
                            </small>
                          </div>
                        </div>
                        <div className="ct-position-bottom">
                          <span>
                            LTP <b>{credits(priceFor(p.outcome))} cr</b>
                          </span>
                          <button
                            disabled={!open || busy || !!pending}
                            onClick={() => ticket(p.outcome, true)}
                          >
                            Exit position
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="ct-empty">
                      <h2>No open positions</h2>
                      <p>Your team positions will appear here.</p>
                      <button onClick={() => setPage('home')}>Explore match</button>
                    </div>
                  )}
                </div>
                {activeSnapshot.executions.length > 0 && (
                  <details className="ct-details">
                    <summary>Order history</summary>
                    {activeSnapshot.executions.map((e) => (
                      <div className="ct-history" key={e.id}>
                        <span>
                          <b>
                            {e.side === 'BUY' ? 'Buy' : 'Exit'} · {teamFor(e.outcome)}
                          </b>
                          <small>
                            {e.quantity} shares · {clock(e.createdAt)}
                          </small>
                        </span>
                        <span>{credits(e.total)} cr</span>
                      </div>
                    ))}
                  </details>
                )}
                {a.receipt && (
                  <details className="ct-details">
                    <summary>Settlement receipt</summary>
                    <p>{a.receipt.reason}</p>
                    <dl>
                      <dt>Principal returned</dt>
                      <dd>{rupees(a.receipt.principal)}</dd>
                      <dt>Pool reward</dt>
                      <dd>{rupees(a.receipt.reward)}</dd>
                      <dt>Total equivalent</dt>
                      <dd>{rupees(a.receipt.payout)}</dd>
                    </dl>
                  </details>
                )}
              </>
            )}
          </>
        )}
      </div>
      {dialog && (
        <div className="ct-modal-backdrop" onClick={() => !busy && setDialog(null)}>
          <div
            className="ct-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              dialog === 'withdraw'
                ? 'Withdraw'
                : dialog === 'fund'
                  ? 'Add credits'
                  : dialog === 'order'
                    ? side === 'BUY'
                      ? 'Buy shares'
                      : 'Exit position'
                    : 'Market details'
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button className="ct-close" aria-label="Close dialog" onClick={() => setDialog(null)}>
              ×
            </button>
            {dialog === 'withdraw' && (
              <>
                <h2>Withdraw</h2>
                <p>{m?.title}</p>
                {!a?.receipt ? (
                  <p>
                    {m?.status === 'SETTLED' || m?.status === 'VOIDED'
                      ? 'You have no settlement payout for this match.'
                      : 'Credits stay locked until this match settles. After the result is confirmed, remaining principal and your share of this match’s loss pool return automatically to your wallet.'}
                  </p>
                ) : m?.mode === 'TEST' ? (
                  <p>This match used test credits. Its settlement cannot be withdrawn as money.</p>
                ) : (
                  <>
                    <div className="ct-conversion">{rupees(a.receipt.payout)}</div>
                    <p>
                      Returned to your wallet when this match settled. Your wallet shows the amount still
                      available to withdraw.
                    </p>
                    <button className="ct-primary" onClick={onWithdraw}>
                      Continue to withdrawal
                    </button>
                  </>
                )}
              </>
            )}
            {dialog === 'fund' && (
              <>
                <h2>Add credits</h2>
                <p>{m?.title} · Credits for this match only</p>
                <p>₹1 = 10 match credits</p>
                <label>
                  Amount (₹)
                  <input
                    autoFocus
                    type="number"
                    min="1"
                    max="100000"
                    value={funding}
                    onChange={(e) => setFunding(e.target.value)}
                  />
                </label>
                <div className="ct-conversion">
                  {credits(Math.round((Number(funding) || 0) * 100))} <small>credits</small>
                </div>
                <p className="ct-subtle">
                  {m?.mode === 'TEST'
                    ? 'Test market. No money will be deducted from your wallet.'
                    : 'Converted funds stay in this match until settlement.'}
                </p>
                <button
                  className="ct-primary"
                  disabled={
                    !open ||
                    busy ||
                    !!pending ||
                    !Number.isFinite(Number(funding)) ||
                    Number(funding) < 1 ||
                    Number(funding) > 100000
                  }
                  onClick={() =>
                    m &&
                    void execute({
                      path: `/markets/${m.id}/fund`,
                      body: { requestId: requestId(), amount: Math.round(Number(funding) * 100) },
                      label: 'Credits added',
                    })
                  }
                >
                  {m?.mode === 'TEST' ? 'Add test credits' : 'Convert to credits'}
                </button>
              </>
            )}
            {dialog === 'order' && (
              <>
                <span className="ct-subtle">{side === 'BUY' ? 'BUY' : 'EXIT POSITION'}</span>
                <h2>{teamFor(orderOutcome)}</h2>
                <p>{credits(orderPrice)} cr per share</p>
                <label>
                  Quantity
                  <input
                    autoFocus
                    type="number"
                    min="1"
                    step="1"
                    max={maximum}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </label>
                <div className="ct-quantity-tools">
                  <small>
                    {side === 'BUY' ? `${credits(a?.balance ?? 0)} cr available` : `${maximum} shares owned`}
                  </small>
                  <button onClick={() => setQuantity(String(maximum))}>
                    {side === 'BUY' ? 'Max' : 'Exit all'}
                  </button>
                </div>
                <dl>
                  <dt>{side === 'BUY' ? 'Order value' : 'Exit value'}</dt>
                  <dd>{Number.isFinite(total) ? credits(total) : '—'} cr</dd>
                  {side === 'SELL' && orderPosition && (
                    <>
                      <dt>Estimated P&L</dt>
                      <dd
                        className={total - count * orderPosition.averagePrice >= 0 ? 'ct-profit' : 'ct-loss'}
                      >
                        {signed(total - count * orderPosition.averagePrice)}
                      </dd>
                    </>
                  )}
                </dl>
                <button
                  className="ct-primary"
                  disabled={!open || !valid || busy || !!pending}
                  onClick={submitOrder}
                >
                  {side === 'BUY' ? 'Confirm buy' : 'Confirm exit'}
                </button>
                <p className="ct-subtle">Credit P&L. Final rewards depend on the match loss pool.</p>
              </>
            )}
            {dialog === 'rules' && (
              <>
                <h2>Market details</h2>
                <p>{m?.reason}</p>
                <p>
                  Prices are estimated win chances. Candles use observed prices: per over, then one minute in
                  the last three overs.
                </p>
                <p>
                  ₹1 = 10 credits. Remaining principal is returned at settlement. Positive net credits share
                  the actual loss pool. No guaranteed cash profit.
                </p>
                <p>
                  Voided matches and pools with no positive participants refund deposits. No fees.{' '}
                  {m?.mode === 'TEST' ? 'This market uses test credits only.' : ''}
                </p>
                <p className="ct-subtle">
                  Drag the price axis to change candle height; drag the time axis to change spacing.
                  Double-click an axis to reset.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
