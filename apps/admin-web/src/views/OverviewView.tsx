import React, { useState } from 'react';
import { DashboardStats, adminApi } from '../services/api';
import {
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Gamepad2,
  Users,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface OverviewViewProps {
  stats: DashboardStats | null;
  onRefresh: () => void;
  loading: boolean;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ stats, onRefresh, loading }) => {
  const [simAmount, setSimAmount] = useState('100.14');
  const [simUtr, setSimUtr] = useState('UTR' + Math.floor(100000000000 + Math.random() * 900000000000));
  const [simLoading, setSimLoading] = useState(false);
  const [simMessage, setSimMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimLoading(true);
    setSimMessage(null);

    try {
      const res = await adminApi.simulatePayment(parseFloat(simAmount), simUtr);
      setSimMessage({
        type: 'success',
        text: `Match verified! Credited ₹${res.matchedDeposit?.totalAmount || simAmount} to ${res.matchedDeposit?.user?.username || 'user'}.`,
      });
      setSimUtr('UTR' + Math.floor(100000000000 + Math.random() * 900000000000));
      onRefresh();
    } catch (err: any) {
      setSimMessage({ type: 'error', text: err.message || 'Simulation failed' });
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 tracking-tight">Executive Overview</h2>
          <p className="text-sm text-zinc-400">Live platform volume, cashflow, and system health.</p>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Listener Watchdog Status Bar */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border text-xs ${
        stats?.listenerStatus === 'ONLINE'
          ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
          : 'bg-amber-950/30 border-amber-800/50 text-amber-300'
      }`}>
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${stats?.listenerStatus === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span className="font-semibold">
            {stats?.listenerStatus === 'ONLINE' ? 'UPI Listener Companion: ONLINE' : 'UPI Listener Companion: OFFLINE / STANDBY'}
          </span>
          <span className="text-zinc-400">
            {stats?.listenerStatus === 'ONLINE'
              ? `(Active auto-matching${stats?.listenerMetadata?.batteryLevel ? ` • Battery: ${stats.listenerMetadata.batteryLevel}%` : ''}${stats?.listenerMetadata?.phoneModel ? ` • ${stats.listenerMetadata.phoneModel}` : ''})`
              : '(Ensure companion app on Android phone is running with battery optimization disabled)'}
          </span>
        </div>
        {stats?.lastHeartbeatAt && (
          <span className="text-zinc-500 text-[11px] mt-1 sm:mt-0">
            Last ping: {new Date(stats.lastHeartbeatAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* KPI Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Inflow (Deposits) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Inflow (Deposits)</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-100 mono-num">
            ₹{(stats?.totalDeposited ?? stats?.totalDepositVolume ?? 0).toFixed(2)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Total approved UPI credits</div>
        </div>

        {/* Total Outflow (Withdrawals) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Payouts (Settled)</span>
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-100 mono-num">
            ₹{(stats?.totalWithdrawn ?? stats?.totalPayoutVolume ?? 0).toFixed(2)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Paid out to player bank accounts</div>
        </div>

        {/* Platform Profit / House Rake */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Platform House Rake</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400 mono-num">
            ₹{(stats?.platformProfit ?? 0).toFixed(2)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Net collected commission revenue</div>
        </div>

        {/* Pending Withdrawals Queue */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Payouts Queue</span>
            <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-800/40 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-300 mono-num">
            {stats?.pendingWithdrawalsCount ?? 0}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Awaiting manual UPI clearance</div>
        </div>

        {/* Active Game Rooms */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Game Rooms</span>
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
              <Gamepad2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-100 mono-num">
            {stats?.activeRooms ?? 0}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Currently open multiplayer tables</div>
        </div>

        {/* Total Registered Users */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Registered Players</span>
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-zinc-100 mono-num">
            {stats?.totalUsersCount ?? stats?.totalUsers ?? 0}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Accounts with active wallets</div>
        </div>
      </div>

      {/* Payment Webhook Simulator Panel */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Live UPI Ingestion Simulator</h3>
            <p className="text-xs text-zinc-400">
              Simulate an incoming Android notification / SMS webhook to test instant auto-approval.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded self-start">
            POST /api/webhooks/upi-notify
          </span>
        </div>

        {simMessage && (
          <div
            className={`mb-4 p-3 rounded-lg border text-xs flex items-center gap-2 ${
              simMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-red-950/40 border-red-800/60 text-red-300'
            }`}
          >
            {simMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
            )}
            <span>{simMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleSimulate} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Exact Amount Paid (with Paise offset)
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={simAmount}
              onChange={(e) => setSimAmount(e.target.value)}
              placeholder="100.14"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 text-sm mono-num"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Bank UTR / Ref No.</label>
            <input
              type="text"
              required
              value={simUtr}
              onChange={(e) => setSimUtr(e.target.value)}
              placeholder="429384729182"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 text-sm mono-num"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={simLoading}
              className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{simLoading ? 'Simulating...' : 'Dispatch Webhook'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
