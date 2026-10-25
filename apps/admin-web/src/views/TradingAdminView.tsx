import React, { useEffect, useState } from 'react';
import { TradingMarketDTO } from '@moneygame/shared-types';
import { adminApi } from '../services/api';

export function TradingAdminView() {
  const [markets, setMarkets] = useState<TradingMarketDTO[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [action, setAction] = useState<{
    market: TradingMarketDTO;
    type: 'pause' | 'settle';
  } | null>(null);
  const [reason, setReason] = useState(''),
    [winner, setWinner] = useState('void');
  async function refresh() {
    try {
      setMarkets(await adminApi.trading<TradingMarketDTO[]>('/markets'));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15000);
    return () => clearInterval(t);
  }, []);
  async function submit() {
    if (!action || !reason.trim()) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.trading(
        `/markets/${action.market.id}/${action.type}`,
        action.type === 'pause'
          ? { paused: true, reason }
          : { winner: winner === 'void' ? null : Number(winner), reason },
      );
      setAction(null);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold">CricTrade markets</h1>
          <p className="text-zinc-400">Test markets, feed status and settlement controls.</p>
        </div>
        <button
          disabled={busy}
          className="bg-emerald-700 text-white px-4 rounded-lg"
          onClick={async () => {
            setBusy(true);
            try {
              await adminApi.trading('/simulation', {});
              await refresh();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Create simulation
        </button>
      </div>
      <div className="bg-amber-50 p-4 rounded-lg text-amber-900">
        Live matches use wallet-funded credits. Existing test balances and simulations remain separate and
        cannot be withdrawn as money. Prices still use the experimental probability model.
      </div>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {markets.map((m) => (
        <article key={m.id} className="border border-zinc-800 rounded-xl p-5 bg-zinc-900">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="font-bold">{m.title}</h2>
              <p>
                {m.status} · {m.mode} · {m.source}
              </p>
              <p className="text-sm text-zinc-400">{m.reason}</p>
              <p className="text-xs text-zinc-400">
                Last source check: {m.feedReceivedAt ? new Date(m.feedReceivedAt).toLocaleString() : 'None'} ·{' '}
                {m.pollingMs / 1000}s cadence
              </p>
            </div>
            {!['SETTLED', 'VOIDED'].includes(m.status) && (
              <div className="flex gap-2 items-start">
                <button
                  className="border p-2 rounded"
                  onClick={() => {
                    setAction({ market: m, type: 'pause' });
                    setReason('');
                  }}
                >
                  Pause
                </button>
                <button
                  className="border p-2 rounded"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await adminApi.trading(`/markets/${m.id}/pause`, {
                        paused: false,
                        reason: 'Operator resumed; awaiting new source state',
                      });
                      await refresh();
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Resume
                </button>
                <button
                  className="border p-2 rounded"
                  onClick={() => {
                    setAction({ market: m, type: 'settle' });
                    setReason('');
                    setWinner('void');
                  }}
                >
                  Settle / refund
                </button>
              </div>
            )}
          </div>
        </article>
      ))}
      {action && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-5">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="CricTrade admin action"
            className="bg-zinc-900 text-zinc-100 border border-zinc-700 p-6 rounded-xl max-w-md w-full space-y-4"
          >
            <h2 className="font-bold text-xl">
              {action.type === 'pause' ? 'Pause' : 'Resolve'} {action.market.title}
            </h2>
            {action.type === 'settle' && (
              <label className="block">
                Final result
                <select
                  className="block border border-zinc-700 bg-zinc-950 p-2 w-full"
                  value={winner}
                  onChange={(e) => setWinner(e.target.value)}
                >
                  <option value="void">Void and refund all deposits</option>
                  <option value="0">{action.market.team0} wins</option>
                  <option value="1">{action.market.team1} wins</option>
                  {action.market.quote?.state.format === 'TEST' && <option value="2">Draw</option>}
                </select>
              </label>
            )}
            <label className="block">
              Reason / result reference
              <textarea
                className="border border-zinc-700 bg-zinc-950 p-2 w-full"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            </label>
            <p className="text-sm text-zinc-400">
              Settlement is final and recorded with your administrator ID.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setAction(null)} disabled={busy}>
                Cancel
              </button>
              <button
                className="bg-emerald-700 text-white px-4 py-2 rounded"
                disabled={busy || !reason.trim()}
                onClick={() => void submit()}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
