import React, { useState, useEffect, useCallback } from 'react';
import { userApi, UserProfile, WithdrawalItem } from '../services/api';
import { connectSocket } from '../services/socket';
import {
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Clock,
  XCircle,
  RefreshCw,
  Wallet,
  Lock,
  Copy,
  Check,
  CheckCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface WithdrawViewProps {
  user: UserProfile;
  balance: number;
  lockedBalance?: number;
  onWithdrawSuccess: () => void;
}

export const WithdrawView: React.FC<WithdrawViewProps> = ({
  user,
  balance,
  lockedBalance = 0,
  onWithdrawSuccess,
}) => {
  const [amount, setAmount] = useState(balance > 0 ? Math.min(balance, 100).toString() : '10');
  const [upiId, setUpiId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // History state
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);

  const presets = ['10', '50', '100', '200', '500'];

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const items = await userApi.getUserWithdrawals(user.id);
      setWithdrawals(items);
    } catch (err) {
      // quiet fail
    } finally {
      setLoadingHistory(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadHistory();

    const socket = connectSocket();
    const onWithdrawalCompleted = () => {
      loadHistory();
      onWithdrawSuccess();
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    };
    const onWithdrawalRejected = () => {
      loadHistory();
      onWithdrawSuccess();
    };

    socket.on('withdrawal_completed', onWithdrawalCompleted);
    socket.on('withdrawal_rejected', onWithdrawalRejected);

    return () => {
      socket.off('withdrawal_completed', onWithdrawalCompleted);
      socket.off('withdrawal_rejected', onWithdrawalRejected);
    };
  }, [loadHistory, onWithdrawSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const withdrawAmount = parseFloat(amount);

    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      setError('Please enter a valid withdrawal amount.');
      return;
    }

    if (withdrawAmount < 10) {
      setError('Minimum withdrawal limit is ₹10.00.');
      return;
    }

    if (withdrawAmount > balance) {
      setError(
        `Requested amount ₹${withdrawAmount.toFixed(2)} exceeds your available balance ₹${balance.toFixed(2)}.`
      );
      return;
    }

    const cleanUpi = upiId.trim();
    if (!cleanUpi || !cleanUpi.includes('@')) {
      setError('Please provide a valid UPI ID (e.g. mobile@paytm or name@okhdfcbank).');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await userApi.requestWithdrawal(user.id, withdrawAmount, cleanUpi);
      setSuccess('Withdrawal initiated! Funds will be dispatched shortly to your UPI.');
      setAmount('');
      onWithdrawSuccess();
      loadHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to submit withdrawal request.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUtr = (utr: string) => {
    navigator.clipboard.writeText(utr);
    setCopiedUtr(utr);
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  const activeWithdrawal = withdrawals.find((w) => w.status === 'PENDING' || w.status === 'PROCESSING');
  const recentCompleted = !activeWithdrawal && withdrawals.length > 0 && withdrawals[0].status === 'COMPLETED' ? withdrawals[0] : null;

  const getStatusBadge = (status: string, utr?: string | null, reason?: string | null) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Paid</span>
            {utr && <span className="font-mono text-[11px] text-emerald-800 ml-1">({utr})</span>}
          </span>
        );
      case 'PENDING':
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
            <span>Withdrawal Initiated</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-red-50 text-red-700 border border-red-200"
            title={reason || undefined}
          >
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            <span>Rejected & Refunded</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Withdraw Funds</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Direct transfer to your bank account via UPI. Instant verification and settlement.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ─── ACTIVE WITHDRAWAL TRACKER: INITIATED -> PAID ─── */}
      {activeWithdrawal && (
        <div className="bg-white border-2 border-amber-300 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                Withdrawal Initiated
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {new Date(activeWithdrawal.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
            <div>
              <span className="text-xs text-slate-500">Requested Payout</span>
              <div className="font-mono tabular-nums text-3xl font-extrabold text-slate-900">
                ₹{activeWithdrawal.amount.toFixed(2)}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-xs text-slate-500">Destination Account</span>
              <div className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 mt-0.5 inline-block">
                {activeWithdrawal.upiId}
              </div>
            </div>
          </div>

          {/* 3-Step Lifecycle Progress Tracker */}
          <div className="pt-2">
            <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              <div className="relative flex items-start gap-3">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                  ✓
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">1. Withdrawal Initiated</div>
                  <div className="text-[11px] text-slate-500">Your withdrawal request was queued and logged.</div>
                </div>
              </div>

              <div className="relative flex items-start gap-3">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] animate-pulse">
                  ●
                </div>
                <div>
                  <div className="text-xs font-bold text-amber-800">2. Processing & IMPS Dispatch</div>
                  <div className="text-[11px] text-slate-500">
                    Admin is reviewing request and sending payment via bank IMPS.
                  </div>
                </div>
              </div>

              <div className="relative flex items-start gap-3">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px]">
                  3
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400">3. Paid (Dispatched)</div>
                  <div className="text-[11px] text-slate-400">Status will automatically flip to Paid with bank UTR.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Estimated clearance time: 15–30 minutes</span>
            <button
              type="button"
              onClick={loadHistory}
              className="text-emerald-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loadingHistory ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── RECENT COMPLETED PAID BANNER (if just paid) ─── */}
      {!activeWithdrawal && recentCompleted && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 sm:p-5 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-2">
                <span>Recent Payout: Paid</span>
                <span className="font-mono text-emerald-700 font-extrabold text-sm">
                  ₹{recentCompleted.amount.toFixed(2)}
                </span>
              </div>
              <div className="text-xs text-emerald-800 mt-0.5">
                Sent to <span className="font-mono font-semibold">{recentCompleted.upiId}</span>
              </div>
            </div>
          </div>

          {recentCompleted.payoutUtr && (
            <button
              type="button"
              onClick={() => handleCopyUtr(recentCompleted.payoutUtr!)}
              className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100/50 text-emerald-900 rounded-lg text-xs font-bold font-mono transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              {copiedUtr === recentCompleted.payoutUtr ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied UTR</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-emerald-700" />
                  <span>UTR: {recentCompleted.payoutUtr}</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* ─── WITHDRAWAL FORM CARD ─── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5 shadow-xs">
        {/* Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold mb-1">
                <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Available to Withdraw</span>
              </div>
              <span className="font-mono tabular-nums text-2xl font-black text-slate-900">
                ₹{balance.toFixed(2)}
              </span>
            </div>
            {balance > 0 && !activeWithdrawal && (
              <button
                type="button"
                onClick={() => setAmount(balance.toFixed(2))}
                className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
              >
                Max
              </button>
            )}
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold mb-1">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>Locked in Play / Pending</span>
              </div>
              <span className="font-mono tabular-nums text-2xl font-black text-slate-700">
                ₹{lockedBalance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Select or Enter Withdrawal Amount (₹)
            </label>
            <div className="grid grid-cols-5 gap-2 mb-2.5">
              {presets.map((val) => (
                <button
                  key={val}
                  type="button"
                  disabled={Boolean(activeWithdrawal) || parseFloat(val) > balance}
                  onClick={() => setAmount(val)}
                  className={`py-2 rounded-xl text-xs font-bold font-mono tabular-nums border transition cursor-pointer ${
                    amount === val
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none'
                  }`}
                >
                  ₹{val}
                </button>
              ))}
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold">
                ₹
              </div>
              <input
                type="number"
                required
                disabled={Boolean(activeWithdrawal)}
                step="any"
                min="10"
                max={balance > 0 ? balance : undefined}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter withdrawal amount (min ₹10.00)"
                className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono tabular-nums font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 disabled:opacity-50"
              />
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Minimum withdrawal: ₹10.00 · Zero processing fees
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Your Receiving UPI ID
            </label>
            <input
              type="text"
              required
              disabled={Boolean(activeWithdrawal)}
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g. 9876543210@paytm or name@okhdfcbank"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 disabled:opacity-50"
            />
          </div>

          {activeWithdrawal ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <Clock className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
              <span>
                You currently have a withdrawal initiated and under review. Once dispatched by Super Admin, you may initiate another withdrawal.
              </span>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 text-slate-500 mt-0.5" />
              <span>
                Withdrawal requests are processed via direct IMPS. Please double check that your UPI ID is correct and active.
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || balance < 10 || Boolean(activeWithdrawal)}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-xs cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ArrowUpRight className="w-4 h-4" />
                <span>
                  {activeWithdrawal ? 'Withdrawal Initiated & In Review' : 'Submit Withdrawal Request'}
                </span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* ─── WITHDRAWAL HISTORY SECTION ─── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Withdrawal History</h3>
            <p className="text-[11px] text-slate-500">Track all initiated payouts and bank UTR numbers</p>
          </div>
          <button
            type="button"
            onClick={loadHistory}
            className="p-1.5 text-slate-500 hover:text-slate-900 transition rounded-lg hover:bg-slate-100 cursor-pointer"
            title="Refresh history"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {withdrawals.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            {loadingHistory ? 'Loading requests...' : 'No withdrawal requests yet.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {withdrawals.map((w) => (
              <div key={w.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums font-black text-sm text-slate-900">
                      ₹{w.amount.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-600 font-mono">→ {w.upiId}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {new Date(w.createdAt).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(w.status, w.payoutUtr, w.reason)}
                  {w.payoutUtr && (
                    <button
                      type="button"
                      onClick={() => handleCopyUtr(w.payoutUtr!)}
                      className="p-1 text-slate-400 hover:text-slate-700 transition"
                      title="Copy UTR"
                    >
                      {copiedUtr === w.payoutUtr ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
