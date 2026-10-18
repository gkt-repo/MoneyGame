import React, { useState, useEffect } from 'react';
import { userApi, UserProfile, WithdrawalItem } from '../services/api';
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
} from 'lucide-react';

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

  const presets = ['10', '50', '100', '200', '500'];

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const items = await userApi.getUserWithdrawals(user.id);
      setWithdrawals(items);
    } catch (err) {
      // quiet fail
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [user.id]);

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
      setSuccess(
        `Withdrawal of ₹${withdrawAmount.toFixed(
          2
        )} submitted successfully! Admin will dispatch funds to ${cleanUpi} shortly.`
      );
      setAmount('');
      onWithdrawSuccess();
      loadHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to submit withdrawal request.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string, utr?: string | null, reason?: string | null) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Paid {utr ? `(UTR: ${utr})` : ''}
          </span>
        );
      case 'PENDING':
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            Pending Payout
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200" title={reason || undefined}>
            <XCircle className="w-3 h-3 text-red-600" />
            Rejected {reason ? `(${reason})` : '(Refunded)'}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Withdraw to Bank</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Transfer your winnings directly to your bank account via UPI.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5 shadow-xs">
        {/* Balance Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium mb-1">
                <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Available Balance</span>
              </div>
              <span className="mono-num text-xl font-bold text-slate-900">
                ₹{balance.toFixed(2)}
              </span>
            </div>
            {balance > 0 && (
              <button
                type="button"
                onClick={() => setAmount(balance.toFixed(2))}
                className="text-xs font-semibold text-emerald-600 hover:underline"
              >
                Max
              </button>
            )}
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium mb-1">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>Locked in Withdrawals</span>
              </div>
              <span className="mono-num text-xl font-bold text-amber-700">
                ₹{lockedBalance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Select or Enter Withdrawal Amount (₹)
            </label>
            <div className="grid grid-cols-5 gap-2 mb-2.5">
              {presets.map((val) => (
                <button
                  key={val}
                  type="button"
                  disabled={parseFloat(val) > balance}
                  onClick={() => setAmount(val)}
                  className={`py-1.5 rounded-lg text-xs font-bold mono-num border transition ${
                    amount === val
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none'
                  }`}
                >
                  ₹{val}
                </button>
              ))}
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-bold">
                ₹
              </div>
              <input
                type="number"
                required
                step="any"
                min="1"
                max={balance > 0 ? balance : undefined}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter withdrawal amount"
                className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm mono-num font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
              />
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Minimum withdrawal: ₹10.00
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Your Receiving UPI ID
            </label>
            <input
              type="text"
              required
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g. 8340271508@ptsbi or name@okhdfcbank"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm mono-num text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
            />
          </div>

          {withdrawals.some((w) => w.status === 'PENDING') || lockedBalance > 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
              <Clock className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
              <span>
                You currently have a pending withdrawal request under review. Super Admin will credit your bank account via IMPS. A new request can be submitted once this is cleared.
              </span>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 text-slate-500 mt-0.5" />
              <span>
                Requested funds will be locked until approved by the admin. If rejected for any reason, the funds will be automatically refunded back to your available balance.
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || balance < 10 || withdrawals.some((w) => w.status === 'PENDING') || lockedBalance > 0}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-xs cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ArrowUpRight className="w-4 h-4" />
                <span>
                  {withdrawals.some((w) => w.status === 'PENDING') || lockedBalance > 0
                    ? 'Withdrawal Request Already Under Review'
                    : 'Submit Withdrawal Request'}
                </span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Withdrawal History Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Your Withdrawal History</h3>
            <p className="text-[11px] text-slate-500">Track all your payout requests and bank UTRs</p>
          </div>
          <button
            type="button"
            onClick={loadHistory}
            className="p-1.5 text-slate-400 hover:text-slate-700 transition rounded hover:bg-slate-50"
            title="Refresh history"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {withdrawals.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs">
            {loadingHistory ? 'Loading requests...' : 'No withdrawal requests yet.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {withdrawals.map((w) => (
              <div key={w.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="mono-num font-bold text-sm text-slate-900">
                      ₹{w.amount.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">→ {w.upiId}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {new Date(w.createdAt).toLocaleString()}
                  </span>
                </div>
                <div>{getStatusBadge(w.status, w.payoutUtr, w.reason)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
