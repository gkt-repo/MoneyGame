import React, { useState, useEffect, useCallback } from 'react';
import { DepositItem, UnmatchedPaymentItem, adminApi } from '../services/api';
import {
  ArrowDownLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Zap,
  AlertTriangle,
  UserCheck,
  Check,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface DepositsViewProps {
  deposits: DepositItem[];
  loading: boolean;
  onRefresh: () => void;
  onSelectUser?: (userId: string) => void;
}

export const DepositsView: React.FC<DepositsViewProps> = ({
  deposits,
  loading,
  onRefresh,
  onSelectUser,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'CLAIMED' | 'APPROVED' | 'PENDING' | 'EXPIRED' | 'UNMATCHED'>('ALL');
  const [search, setSearch] = useState('');

  // Unmatched payments
  const [unmatched, setUnmatched] = useState<UnmatchedPaymentItem[]>([]);
  const [loadingUnmatched, setLoadingUnmatched] = useState(false);

  // Approve modal
  const [approvingDeposit, setApprovingDeposit] = useState<DepositItem | null>(null);
  const [approveUtr, setApproveUtr] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Assign Unmatched modal
  const [assigningItem, setAssigningItem] = useState<UnmatchedPaymentItem | null>(null);
  const [assignUserId, setAssignUserId] = useState('');

  const loadUnmatched = useCallback(async () => {
    try {
      setLoadingUnmatched(true);
      const items = await adminApi.getUnmatchedPayments('UNCLAIMED');
      setUnmatched(items);
    } catch (_) {
    } finally {
      setLoadingUnmatched(false);
    }
  }, []);

  useEffect(() => {
    loadUnmatched();
  }, [loadUnmatched]);

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingDeposit || !approveUtr.trim()) return;

    setActionLoading(true);
    setActionError(null);

    try {
      await adminApi.approveDeposit(approvingDeposit.id, approveUtr.trim());
      setApprovingDeposit(null);
      setApproveUtr('');
      onRefresh();
      loadUnmatched();
    } catch (err: any) {
      setActionError(err.message || 'Failed to approve deposit');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (depositId: string) => {
    if (!window.confirm('Are you sure you want to reject this deposit request?')) return;
    try {
      await adminApi.rejectDeposit(depositId, 'Declined by administrator');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to reject deposit');
    }
  };

  const handleAssignUnmatched = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningItem || !assignUserId.trim()) return;

    setActionLoading(true);
    setActionError(null);

    try {
      await adminApi.assignUnmatchedPayment(assigningItem.id, assignUserId.trim());
      setAssigningItem(null);
      setAssignUserId('');
      loadUnmatched();
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to assign payment');
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = deposits.filter((d) => {
    if (filter === 'UNMATCHED') return false;
    if (filter !== 'ALL' && d.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchUtr = d.utr?.toLowerCase().includes(q) || d.userClaimedUtr?.toLowerCase().includes(q);
      const matchUser = d.user?.username.toLowerCase().includes(q);
      const matchPhone = d.user?.phone?.includes(q);
      const matchAmount = d.totalAmount.toString().includes(q);
      return matchUtr || matchUser || matchPhone || matchAmount;
    }
    return true;
  });

  const getStatusBadge = (status: string, claimedUtr?: string | null) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </span>
        );
      case 'CLAIMED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-blue-950/60 text-blue-300 border border-blue-800/50">
            <Zap className="w-3 h-3 text-amber-400" />
            User Claimed UTR
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-950/60 text-amber-300 border border-amber-800/50">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            <XCircle className="w-3 h-3" />
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 tracking-tight">Deposit Ledger</h2>
          <p className="text-sm text-zinc-400">All dynamic UPI payment requests, user claims, and auto-approvals.</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 p-1 rounded-lg self-start sm:self-auto overflow-x-auto max-w-full">
          {(['ALL', 'CLAIMED', 'APPROVED', 'PENDING', 'EXPIRED', 'UNMATCHED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition ${
                filter === tab
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab === 'UNMATCHED' ? `Unmatched (${unmatched.length})` : tab}
            </button>
          ))}
        </div>
      </div>

      {filter === 'UNMATCHED' ? (
        /* Unmatched Bank Payments Ledger */
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-zinc-100">Unmatched / Orphan Bank Payments</h3>
              <p className="text-xs text-zinc-400">
                Payments received in your bank via webhook that did not match an active user deposit request.
              </p>
            </div>
            <button
              onClick={loadUnmatched}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded"
              title="Refresh unmatched"
            >
              <RefreshCw className={`w-4 h-4 ${loadingUnmatched ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950/60 border-b border-zinc-800 text-zinc-400 text-xs uppercase font-medium">
                <tr>
                  <th className="px-4 py-3">Received At</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Bank UTR</th>
                  <th className="px-4 py-3">Sender VPA</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 text-zinc-300">
                {unmatched.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                      {loadingUnmatched ? 'Loading unmatched payments...' : 'No unmatched bank payments right now. All clear!'}
                    </td>
                  </tr>
                ) : (
                  unmatched.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-800/40 transition">
                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {new Date(u.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 mono-num font-bold text-emerald-400 text-base">
                        ₹{u.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 mono-num text-xs text-zinc-200">
                        <span className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                          {u.utr || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {u.senderUpi || 'Unknown'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/50">
                          Unassigned
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setAssigningItem(u);
                            setAssignUserId('');
                            setActionError(null);
                          }}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition shadow-sm"
                        >
                          Credit to Player
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Regular Deposits Table */
        <>
          {/* Search Bar */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by UTR, Player Phone, Username, or Amount..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-950/60 border-b border-zinc-800 text-zinc-400 text-xs uppercase font-medium">
                  <tr>
                    <th className="px-5 py-3.5">Created At</th>
                    <th className="px-5 py-3.5">Player</th>
                    <th className="px-5 py-3.5">Base Fee</th>
                    <th className="px-5 py-3.5">Payable</th>
                    <th className="px-5 py-3.5">Bank UTR / User Claim</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-zinc-500">
                        {loading ? 'Loading deposits...' : 'No deposit records match your filter.'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((d) => (
                      <tr key={d.id} className="hover:bg-zinc-800/40 transition">
                        <td className="px-5 py-3.5 text-xs text-zinc-400 whitespace-nowrap">
                          {new Date(d.createdAt).toLocaleString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-5 py-3.5">
                          <div
                            onClick={() => onSelectUser && onSelectUser(d.userId)}
                            className={`font-medium text-zinc-200 ${
                              onSelectUser ? 'hover:text-emerald-400 cursor-pointer transition' : ''
                            }`}
                          >
                            {d.user?.username || 'Unknown'}
                          </div>
                          <div className="text-xs text-zinc-500">{d.user?.phone || 'No phone'}</div>
                        </td>
                        <td className="px-5 py-3.5 mono-num text-zinc-400">₹{d.baseAmount.toFixed(2)}</td>
                        <td className="px-5 py-3.5 mono-num font-semibold text-emerald-400">
                          ₹{d.totalAmount.toFixed(2)}
                          <span className="text-[11px] text-zinc-500 ml-1.5 font-normal">
                            (+{d.offsetPaise}p)
                          </span>
                        </td>
                        <td className="px-5 py-3.5 mono-num text-xs">
                          {d.utr ? (
                            <span className="bg-zinc-950 px-2 py-1 rounded border border-zinc-800 text-zinc-300">
                              {d.utr}
                            </span>
                          ) : d.userClaimedUtr ? (
                            <div>
                              <span className="bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60 text-amber-300">
                                User Claim: {d.userClaimedUtr}
                              </span>
                            </div>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">{getStatusBadge(d.status, d.userClaimedUtr)}</td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          {d.status === 'PENDING' || d.status === 'CLAIMED' ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setApprovingDeposit(d);
                                  setApproveUtr(d.userClaimedUtr || '');
                                  setActionError(null);
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition shadow-sm"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(d.id)}
                                className="px-2 py-1 bg-zinc-800 hover:bg-red-950/60 hover:text-red-400 border border-zinc-700 text-zinc-400 rounded text-xs font-medium transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-600">Settled</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Manual Deposit Approval Modal */}
      {approvingDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-zinc-100">Approve & Credit Deposit</h3>
            <p className="text-xs text-zinc-400">
              Confirm bank receipt of <strong className="text-zinc-100">₹{approvingDeposit.baseAmount.toFixed(2)}</strong> for player <span className="text-emerald-400 font-semibold">{approvingDeposit.user?.username}</span>.
            </p>

            {actionError && (
              <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded text-red-300 text-xs">
                {actionError}
              </div>
            )}

            <form onSubmit={handleApprove} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Bank UTR / UPI Reference ID
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={approveUtr}
                  onChange={(e) => setApproveUtr(e.target.value)}
                  placeholder="e.g. 429384729182"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 text-sm mono-num focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setApprovingDeposit(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !approveUtr.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Credit Wallet Now</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Unmatched Payment Modal */}
      {assigningItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-zinc-100">Assign Bank Payment to Player</h3>
            <p className="text-xs text-zinc-400">
              Credit <strong className="text-zinc-100">₹{assigningItem.amount.toFixed(2)}</strong> (UTR: {assigningItem.utr || 'N/A'}) directly to a user's wallet.
            </p>

            {actionError && (
              <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded text-red-300 text-xs">
                {actionError}
              </div>
            )}

            <form onSubmit={handleAssignUnmatched} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Recipient User ID
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value.trim())}
                  placeholder="Paste player User ID from Users tab"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 text-sm mono-num focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssigningItem(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !assignUserId.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                  <span>Credit to Player</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
