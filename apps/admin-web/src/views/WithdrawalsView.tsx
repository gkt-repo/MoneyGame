import React, { useState } from 'react';
import { WithdrawalItem, adminApi } from '../services/api';
import {
  ArrowUpRight,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface WithdrawalsViewProps {
  withdrawals: WithdrawalItem[];
  loading: boolean;
  onRefresh: () => void;
  onSelectUser?: (userId: string) => void;
}

export const WithdrawalsView: React.FC<WithdrawalsViewProps> = ({
  withdrawals,
  loading,
  onRefresh,
  onSelectUser,
}) => {
  const [filter, setFilter] = useState<'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'ALL'>('PENDING');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals state
  const [completeItem, setCompleteItem] = useState<WithdrawalItem | null>(null);
  const [payoutUtr, setPayoutUtr] = useState('');
  const [rejectItem, setRejectItem] = useState<WithdrawalItem | null>(null);
  const [rejectReason, setRejectReason] = useState('Invalid UPI ID / Bank rejected transfer');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const claimPayout = async (w: WithdrawalItem) => {
    const source = w.assignedModeratorId ? `the reserved account ${w.payoutAccountUpi}` : 'external admin funds (no moderator account will be debited)';
    if (w.status === 'PENDING' && !window.confirm(`Claim this payout before sending money from ${source}?`)) return;
    try {
      await adminApi.claimWithdrawal(w.id, !w.assignedModeratorId);
      setCompleteItem(w); setPayoutUtr(''); setActionError(null); onRefresh();
    } catch (error: any) { window.alert(error.message || 'Unable to claim this payout'); }
  };

  const handleCopyUpi = (upiId: string, id: string) => {
    navigator.clipboard.writeText(upiId);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCompletePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeItem || !payoutUtr.trim()) return;

    setSubmitting(true);
    setActionError(null);

    try {
      await adminApi.completeWithdrawal(completeItem.id, payoutUtr.trim());
      setCompleteItem(null);
      setPayoutUtr('');
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to complete payout');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectItem) return;

    setSubmitting(true);
    setActionError(null);

    try {
      await adminApi.rejectWithdrawal(rejectItem.id, rejectReason.trim());
      setRejectItem(null);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject payout');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = withdrawals.filter((w) => {
    if (filter === 'ALL') return true;
    return w.status === filter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 tracking-tight">Withdrawals Action Center</h2>
          <p className="text-sm text-zinc-400">Review pending player payout requests and dispatch funds.</p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 p-1 rounded-lg self-start sm:self-auto">
          {(['PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED', 'ALL'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                filter === tab
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Withdrawals Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950/60 border-b border-zinc-800 text-zinc-400 text-xs uppercase font-medium">
              <tr>
                <th className="px-5 py-3.5">Requested At</th>
                <th className="px-5 py-3.5">Player</th>
                <th className="px-5 py-3.5">Amount</th>
                <th className="px-5 py-3.5">Destination UPI ID</th>
                <th className="px-5 py-3.5">Payout UTR</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-300">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-zinc-500">
                    {loading ? 'Loading withdrawal requests...' : 'No withdrawal records match filter.'}
                  </td>
                </tr>
              ) : (
                filtered.map((w) => (
                  <tr key={w.id} className="hover:bg-zinc-800/40 transition">
                    <td className="px-5 py-3.5 text-xs text-zinc-400 whitespace-nowrap">
                      {new Date(w.createdAt).toLocaleString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div
                        onClick={() => onSelectUser && onSelectUser(w.userId)}
                        className={`font-medium text-zinc-200 ${onSelectUser ? 'hover:text-emerald-400 cursor-pointer transition' : ''}`}
                      >
                        {w.user?.username || 'Unknown'}
                      </div>
                      <div className="text-xs text-zinc-500">{w.user?.phone || 'No phone'}</div>
                    </td>
                    <td className="px-5 py-3.5 mono-num font-bold text-zinc-100 text-base">
                      ₹{w.amount.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs mono-num text-zinc-200">
                        <span>{w.upiId}<small className="block">{w.assignedModeratorId ? `Assigned to @${w.assignedModeratorName || w.assignedModeratorId}` : 'Unassigned'}</small></span>
                        <button
                          onClick={() => claimPayout(w)}
                          title="Copy UPI Address"
                          className="text-zinc-500 hover:text-emerald-400 transition"
                        >
                          {copiedId === w.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 mono-num text-xs text-zinc-400">
                      {w.payoutUtr ? (
                        <span className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-zinc-300">
                          {w.payoutUtr}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {w.status === 'COMPLETED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                          <CheckCircle2 className="w-3 h-3" />
                          Settled
                        </span>
                      ) : w.status === 'REJECTED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-red-950/60 text-red-400 border border-red-800/50">
                          <XCircle className="w-3 h-3" />
                          Rejected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-950/60 text-amber-300 border border-amber-800/50">
                          <Clock className="w-3 h-3" />
                          Pending Action
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      {['PENDING', 'PROCESSING'].includes(w.status) ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => claimPayout(w)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition shadow-sm"
                          >
                            Claim / Pay
                          </button>
                          <button
                            onClick={() => {
                              setRejectItem(w);
                              setActionError(null);
                            }}
                            className="px-2.5 py-1 bg-zinc-800 hover:bg-red-950/60 hover:text-red-400 border border-zinc-700 text-zinc-400 rounded text-xs font-medium transition"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-600">Processed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mark Completed Modal */}
      {completeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-100 mb-1">Confirm Bank Payout</h3>
            <p className="text-xs text-zinc-400 mb-4">
              Enter the bank transfer UTR after sending <strong className="text-zinc-100">₹{completeItem.amount.toFixed(2)}</strong> to <span className="font-mono text-emerald-400">{completeItem.upiId}</span>.
            </p>

            {actionError && (
              <div className="mb-4 p-2.5 bg-red-950/40 border border-red-800/60 rounded text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <button className="text-emerald-400 mb-3" onClick={() => handleCopyUpi(completeItem.upiId, completeItem.id)}>Copy UPI (claimed payout)</button>
            <p className="text-xs text-zinc-400 mb-3">Funding: {completeItem.payoutAccountUpi || 'External admin funds'}. Send once; retain the UTR if recording fails.</p>
            <form onSubmit={handleCompletePayout} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Bank / UPI Payout UTR
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={payoutUtr}
                  onChange={(e) => setPayoutUtr(e.target.value)}
                  placeholder="e.g. 429384729182"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 text-sm mono-num focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompleteItem(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !payoutUtr.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Settlement</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-100 mb-1">Reject Withdrawal Request</h3>
            <p className="text-xs text-zinc-400 mb-4">
              The locked amount of <strong className="text-zinc-100">₹{rejectItem.amount.toFixed(2)}</strong> will be immediately refunded back to player wallet <span className="text-zinc-200">({rejectItem.user?.username})</span>.
            </p>

            {actionError && (
              <div className="mb-4 p-2.5 bg-red-950/40 border border-red-800/60 rounded text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleRejectPayout} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Rejection Reason (Visible to player)
                </label>
                <input
                  type="text"
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Invalid UPI VPA address"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectItem(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !rejectReason.trim()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Reject & Refund</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
