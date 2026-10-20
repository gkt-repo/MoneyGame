import React, { useEffect, useState, useCallback } from 'react';
import {
  adminApi,
  UserProfileDetail,
  FeedbackItem,
} from '../services/api';
import {
  X,
  User,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Gamepad2,
  Clock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Ban,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  PlusCircle,
  MinusCircle,
  MessageSquare,
  FileText,
  Send,
  Loader2,
  Phone,
  Mail,
  TrendingUp,
  Percent,
} from 'lucide-react';

interface UserProfileModalProps {
  userId: string | null;
  onClose: () => void;
  onUserUpdated?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  userId,
  onClose,
  onUserUpdated,
}) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfileDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'transactions' | 'deposits' | 'withdrawals' | 'games' | 'feedback' | 'audit'
  >('overview');

  // Actions state
  const [copiedId, setCopiedId] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Balance Adjustment State
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustType, setAdjustType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Quick Reply to Feedback
  const [replyingFeedbackId, setReplyingFeedbackId] = useState<string | null>(null);
  const [feedbackReplyText, setFeedbackReplyText] = useState('');
  const [feedbackReplyStatus, setFeedbackReplyStatus] = useState<'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'>('RESOLVED');
  const [submittingReply, setSubmittingReply] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getUserDetail(userId);
      setProfile(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load user profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchProfile();
    }
  }, [userId, fetchProfile]);

  const handleCopyId = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleStatusChange = async (newStatus: 'ACTIVE' | 'SUSPENDED' | 'BANNED') => {
    if (!profile) return;
    const confirmMsg = `Are you sure you want to change ${profile.username}'s status to ${newStatus}?`;
    if (!window.confirm(confirmMsg)) return;

    setStatusUpdating(true);
    setStatusMessage(null);
    try {
      await adminApi.updateUserStatus(profile.id, newStatus, `Admin changed status to ${newStatus}`);
      setStatusMessage(`Status updated to ${newStatus}`);
      await fetchProfile();
      if (onUserUpdated) onUserUpdated();
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      alert(`Error updating status: ${err.message}`);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const parsed = parseFloat(adjustAmount);
    if (isNaN(parsed) || parsed <= 0) {
      setAdjustError('Please enter a valid amount greater than 0');
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError('Please specify a reason for the adjustment');
      return;
    }

    const finalAmount = adjustType === 'CREDIT' ? parsed : -parsed;
    setAdjusting(true);
    setAdjustError(null);
    try {
      await adminApi.adjustUserBalance(profile.id, finalAmount, adjustReason.trim());
      setShowAdjustModal(false);
      setAdjustAmount('');
      setAdjustReason('');
      await fetchProfile();
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      setAdjustError(err.message || 'Failed to adjust balance');
    } finally {
      setAdjusting(false);
    }
  };

  const handleSendFeedbackReply = async (feedbackId: string) => {
    if (!feedbackReplyText.trim()) return;
    setSubmittingReply(true);
    try {
      await adminApi.replyFeedback(feedbackId, feedbackReplyText.trim(), feedbackReplyStatus);
      setReplyingFeedbackId(null);
      setFeedbackReplyText('');
      await fetchProfile();
      if (onUserUpdated) onUserUpdated();
    } catch (err: any) {
      alert(`Error sending reply: ${err.message}`);
    } finally {
      setSubmittingReply(false);
    }
  };

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Bar */}
        <div className="p-4 sm:p-6 border-b border-zinc-800 flex items-start justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-emerald-400 font-bold text-lg shrink-0">
              {profile ? profile.username.slice(0, 2).toUpperCase() : <User className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-zinc-100 tracking-tight">
                  {profile ? profile.username : 'User Details'}
                </h2>
                {profile && (
                  <>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        profile.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : profile.status === 'SUSPENDED'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {profile.status}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 uppercase">
                      {profile.role}
                    </span>
                  </>
                )}
              </div>
              {profile && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 mt-1">
                  <span className="flex items-center gap-1">
                    ID: <code className="text-zinc-300 bg-zinc-800/80 px-1 py-0.5 rounded">{profile.id}</code>
                    <button
                      onClick={() => handleCopyId(profile.id)}
                      className="p-1 hover:text-emerald-400 transition"
                      title="Copy User ID"
                    >
                      {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </span>
                  <span>•</span>
                  <span>Joined {new Date(profile.createdAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchProfile}
              disabled={loading}
              title="Refresh"
              className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {loading && !profile ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-zinc-400">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-3" />
            <p className="text-sm">Loading user account telemetry...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
            <p className="text-rose-400 text-sm">{error}</p>
            <button
              onClick={fetchProfile}
              className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : profile ? (
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* Quick Admin Actions Ribbon */}
            <div className="px-4 sm:px-6 py-3 bg-zinc-950/40 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider mr-1">
                  Actions:
                </span>
                <button
                  onClick={() => setShowAdjustModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold transition"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Adjust Balance</span>
                </button>

                {profile.status !== 'ACTIVE' && (
                  <button
                    onClick={() => handleStatusChange('ACTIVE')}
                    disabled={statusUpdating}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Activate User</span>
                  </button>
                )}

                {profile.status !== 'SUSPENDED' && (
                  <button
                    onClick={() => handleStatusChange('SUSPENDED')}
                    disabled={statusUpdating}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium transition"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Suspend User</span>
                  </button>
                )}

                {profile.status !== 'BANNED' && (
                  <button
                    onClick={() => handleStatusChange('BANNED')}
                    disabled={statusUpdating}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-medium transition"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Ban User</span>
                  </button>
                )}
              </div>

              {statusMessage && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {statusMessage}
                </span>
              )}
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4 sm:p-6 bg-zinc-900/50 border-b border-zinc-800">
              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-xl">
                <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-medium">
                  Wallet Balance
                </span>
                <div className="text-xl font-bold text-emerald-400 mt-1">
                  ₹{(profile.wallet?.balance || 0).toFixed(2)}
                </div>
                {profile.wallet && profile.wallet.lockedBalance > 0 && (
                  <div className="text-[10px] text-amber-400/90 mt-0.5">
                    Locked: ₹{profile.wallet.lockedBalance.toFixed(2)}
                  </div>
                )}
              </div>

              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-xl">
                <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-medium">
                  Deposits
                </span>
                <div className="text-lg font-bold text-zinc-100 mt-1">
                  ₹{profile.metrics.approvedDepositsSum.toFixed(2)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {profile.metrics.totalDepositsCount} deposits
                </div>
              </div>

              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-xl">
                <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-medium">
                  Withdrawals
                </span>
                <div className="text-lg font-bold text-zinc-100 mt-1">
                  ₹{profile.metrics.completedWithdrawalsSum.toFixed(2)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {profile.metrics.totalWithdrawalsCount} payouts
                </div>
              </div>

              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-xl">
                <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-medium">
                  User Net P&L
                </span>
                <div
                  className={`text-lg font-bold mt-1 ${
                    profile.metrics.netProfitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {profile.metrics.netProfitLoss >= 0 ? '+' : ''}₹{profile.metrics.netProfitLoss.toFixed(2)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {profile.metrics.netProfitLoss >= 0 ? 'In profit' : 'In loss'}
                </div>
              </div>

              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-xl">
                <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-medium">
                  Games Played
                </span>
                <div className="text-lg font-bold text-zinc-100 mt-1">
                  {profile.metrics.roomsPlayed}
                </div>
                <div className="text-[10px] text-emerald-400 mt-0.5">
                  {profile.metrics.roomsWon} won ({profile.metrics.winRate}%)
                </div>
              </div>

              <div className="bg-zinc-950/70 border border-zinc-800/80 p-3 rounded-xl">
                <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-medium">
                  Tickets / Feedback
                </span>
                <div className="text-lg font-bold text-zinc-100 mt-1">
                  {profile.feedbacks.length}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {profile.feedbacks.filter((f) => f.status === 'OPEN').length} pending
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="border-b border-zinc-800 px-4 sm:px-6 bg-zinc-950/40">
              <nav className="flex space-x-4 overflow-x-auto py-2 text-sm">
                {[
                  { id: 'overview', label: 'Overview & Info', icon: User },
                  { id: 'transactions', label: 'Transactions', count: profile.recentTransactions.length, icon: FileText },
                  { id: 'deposits', label: 'Deposits', count: profile.recentDeposits.length, icon: ArrowDownLeft },
                  { id: 'withdrawals', label: 'Withdrawals', count: profile.recentWithdrawals.length, icon: ArrowUpRight },
                  { id: 'games', label: 'Game History', count: profile.recentGames.length, icon: Gamepad2 },
                  { id: 'feedback', label: 'Support & Feedback', count: profile.feedbacks.length, icon: MessageSquare },
                  { id: 'audit', label: 'Audit Trail', count: profile.auditLogs.length, icon: Shield },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 py-2 px-3 rounded-lg font-medium whitespace-nowrap transition text-xs sm:text-sm ${
                        active
                          ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                      {typeof tab.count === 'number' && tab.count > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-full">
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Tab Contents */}
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
              {/* Tab: Overview */}
              {activeTab === 'overview' && (
                <div className="space-y-6 max-w-3xl">
                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
                      User Contact & Account Info
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-zinc-500 block">Username</span>
                        <span className="font-semibold text-zinc-200">{profile.username}</span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 block">Phone Number</span>
                        <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
                          <Phone className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{profile.phone || 'Not provided'}</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 block">Email Address</span>
                        <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
                          <Mail className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{profile.email || 'Not provided'}</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 block">Account Status</span>
                        <span className="font-semibold text-zinc-200">{profile.status}</span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 block">Member Since</span>
                        <span className="font-semibold text-zinc-200">
                          {new Date(profile.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 block">Last Profile Update</span>
                        <span className="font-semibold text-zinc-200">
                          {new Date(profile.updatedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
                      Quick Wallet Summary
                    </h3>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="p-3 bg-zinc-900 rounded-lg flex-1 min-w-[140px]">
                        <span className="text-xs text-zinc-500 block">Available Cash</span>
                        <span className="text-lg font-bold text-emerald-400">
                          ₹{(profile.wallet?.balance || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="p-3 bg-zinc-900 rounded-lg flex-1 min-w-[140px]">
                        <span className="text-xs text-zinc-500 block">In-Game Locked</span>
                        <span className="text-lg font-bold text-amber-400">
                          ₹{(profile.wallet?.lockedBalance || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="p-3 bg-zinc-900 rounded-lg flex-1 min-w-[140px]">
                        <span className="text-xs text-zinc-500 block">Total Win Rate</span>
                        <span className="text-lg font-bold text-zinc-100">
                          {profile.metrics.winRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Transactions */}
              {activeTab === 'transactions' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Showing last {profile.recentTransactions.length} transactions</span>
                  </div>
                  {profile.recentTransactions.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-sm">No transaction records found</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-400 uppercase font-medium">
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Type</th>
                            <th className="py-2.5 px-3">Amount</th>
                            <th className="py-2.5 px-3">Description</th>
                            <th className="py-2.5 px-3">Ref ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {profile.recentTransactions.map((tx) => (
                            <tr key={tx.id} className="hover:bg-zinc-800/30">
                              <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">
                                {new Date(tx.createdAt).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded font-medium">
                                  {tx.type}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-semibold whitespace-nowrap">
                                <span
                                  className={
                                    tx.amount > 0
                                      ? 'text-emerald-400'
                                      : tx.amount < 0
                                      ? 'text-rose-400'
                                      : 'text-zinc-400'
                                  }
                                >
                                  {tx.amount === 0 ? '' : tx.amount > 0 ? '+' : '-'}₹{Math.abs(tx.amount).toFixed(2)}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-zinc-300">{tx.description || '-'}</td>
                              <td className="py-2.5 px-3 text-zinc-500 font-mono">
                                {tx.referenceId ? `${tx.referenceId.slice(0, 10)}...` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Deposits */}
              {activeTab === 'deposits' && (
                <div className="space-y-3">
                  <div className="text-xs text-zinc-400">
                    Total Deposited: ₹{profile.metrics.approvedDepositsSum.toFixed(2)} ({profile.recentDeposits.length} recorded)
                  </div>
                  {profile.recentDeposits.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-sm">No deposit requests found</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-400 uppercase font-medium">
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Amount</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">UTR</th>
                            <th className="py-2.5 px-3">Receiving UPI</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {profile.recentDeposits.map((dep) => (
                            <tr key={dep.id} className="hover:bg-zinc-800/30">
                              <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">
                                {new Date(dep.createdAt).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-zinc-200">
                                ₹{dep.baseAmount.toFixed(2)}{' '}
                                <span className="text-[10px] text-zinc-500">
                                  (₹{dep.totalAmount.toFixed(2)})
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    dep.status === 'APPROVED'
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                      : dep.status === 'PENDING'
                                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                      : 'bg-zinc-800 text-zinc-400'
                                  }`}
                                >
                                  {dep.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-zinc-300">
                                {dep.utr || <span className="text-zinc-600">Pending</span>}
                              </td>
                              <td className="py-2.5 px-3 text-zinc-400">{dep.receivingUpi}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Withdrawals */}
              {activeTab === 'withdrawals' && (
                <div className="space-y-3">
                  <div className="text-xs text-zinc-400">
                    Total Paid Out: ₹{profile.metrics.completedWithdrawalsSum.toFixed(2)}
                  </div>
                  {profile.recentWithdrawals.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-sm">No withdrawals found</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-400 uppercase font-medium">
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Amount</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Payout UPI</th>
                            <th className="py-2.5 px-3">Payout UTR / Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {profile.recentWithdrawals.map((w) => (
                            <tr key={w.id} className="hover:bg-zinc-800/30">
                              <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">
                                {new Date(w.createdAt).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-zinc-100">
                                ₹{w.amount.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    w.status === 'COMPLETED'
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                      : w.status === 'PENDING'
                                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                  }`}
                                >
                                  {w.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-zinc-300">{w.upiId}</td>
                              <td className="py-2.5 px-3 text-zinc-400">
                                {w.payoutUtr || w.reason || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Game History */}
              {activeTab === 'games' && (
                <div className="space-y-3">
                  <div className="text-xs text-zinc-400">
                    Played: {profile.metrics.roomsPlayed} | Won: {profile.metrics.roomsWon} | Win Rate:{' '}
                    {profile.metrics.winRate}%
                  </div>
                  {profile.recentGames.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-sm">No game participation found</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-400 uppercase font-medium">
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Room Code</th>
                            <th className="py-2.5 px-3">Entry Fee</th>
                            <th className="py-2.5 px-3">Chosen Guess</th>
                            <th className="py-2.5 px-3">Winning Roll</th>
                            <th className="py-2.5 px-3">Outcome</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {profile.recentGames.map((game) => (
                            <tr key={game.id} className="hover:bg-zinc-800/30">
                              <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">
                                {new Date(game.createdAt).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-zinc-200">#{game.roomCode}</td>
                              <td className="py-2.5 px-3 font-semibold text-zinc-300">
                                ₹{game.entryFee.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-zinc-200">{game.guessNumber}</td>
                              <td className="py-2.5 px-3 font-mono text-zinc-400">
                                {game.winningNumber !== null ? game.winningNumber : 'In play'}
                              </td>
                              <td className="py-2.5 px-3">
                                {game.isWinner ? (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                    🏆 WON
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">
                                    LOST
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Support & Feedback */}
              {activeTab === 'feedback' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-zinc-200">
                      User Tickets & Feedback ({profile.feedbacks.length})
                    </h4>
                  </div>
                  {profile.feedbacks.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-sm">
                      This user hasn't submitted any feedback or support tickets yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {profile.feedbacks.map((item) => (
                        <div
                          key={item.id}
                          className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded">
                                {item.category}
                              </span>
                              <h5 className="font-semibold text-zinc-100 text-sm">{item.subject}</h5>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                  item.status === 'RESOLVED'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                    : item.status === 'IN_PROGRESS'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                }`}
                              >
                                {item.status}
                              </span>
                              <span className="text-[11px] text-zinc-500">
                                {new Date(item.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          <p className="text-xs sm:text-sm text-zinc-300 whitespace-pre-wrap bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/60">
                            {item.message}
                          </p>

                          {item.contactInfo && (
                            <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                              <span className="text-zinc-500">Provided Contact:</span>
                              <span className="font-mono text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">
                                {item.contactInfo}
                              </span>
                            </div>
                          )}

                          {item.adminReply && (
                            <div className="mt-2 bg-emerald-950/20 border border-emerald-800/40 p-3 rounded-lg space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-emerald-400 font-semibold">
                                <span>Admin Response:</span>
                                {item.repliedAt && (
                                  <span className="text-zinc-500 font-normal">
                                    {new Date(item.repliedAt).toLocaleString()}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-200 whitespace-pre-wrap">{item.adminReply}</p>
                            </div>
                          )}

                          {/* Reply Action */}
                          {replyingFeedbackId === item.id ? (
                            <div className="mt-3 bg-zinc-900 p-3 rounded-lg border border-zinc-800 space-y-3">
                              <textarea
                                value={feedbackReplyText}
                                onChange={(e) => setFeedbackReplyText(e.target.value)}
                                placeholder="Type your reply to resolve or update the user..."
                                rows={3}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500"
                              />
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-zinc-400">Set status:</span>
                                  <select
                                    value={feedbackReplyStatus}
                                    onChange={(e) => setFeedbackReplyStatus(e.target.value as any)}
                                    className="bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 rounded px-2 py-1"
                                  >
                                    <option value="RESOLVED">RESOLVED</option>
                                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                                    <option value="CLOSED">CLOSED</option>
                                  </select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setReplyingFeedbackId(null)}
                                    className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleSendFeedbackReply(item.id)}
                                    disabled={submittingReply || !feedbackReplyText.trim()}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-semibold"
                                  >
                                    {submittingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                    <span>Send Reply</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setReplyingFeedbackId(item.id);
                                setFeedbackReplyText(item.adminReply || '');
                              }}
                              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 mt-1"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>{item.adminReply ? 'Update Reply' : 'Reply & Resolve'}</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Audit Logs */}
              {activeTab === 'audit' && (
                <div className="space-y-3">
                  <div className="text-xs text-zinc-400">
                    Showing administrative audit events targeting this user
                  </div>
                  {profile.auditLogs.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-sm">No administrative audit records found</div>
                  ) : (
                    <div className="space-y-2">
                      {profile.auditLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-zinc-200">{log.action}</span>
                            <span className="text-zinc-500">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-zinc-400">
                            By admin:{' '}
                            <span className="text-zinc-200 font-medium">{log.actor.username}</span>
                          </div>
                          {log.details && (
                            <pre className="bg-zinc-900 p-2 rounded text-[11px] text-zinc-300 overflow-x-auto">
                              {log.details}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs text-zinc-500">
          <span>Target User Profile Details</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>

      {/* Nested Modal: Adjust Balance */}
      {showAdjustModal && profile && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-bold text-zinc-100 text-base">Adjust User Balance</h3>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Adjust balance for user <strong className="text-zinc-200">{profile.username}</strong>.
              Current balance: <span className="text-emerald-400 font-bold">₹{(profile.wallet?.balance || 0).toFixed(2)}</span>
            </p>

            <form onSubmit={handleAdjustBalance} className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustType('CREDIT')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition ${
                    adjustType === 'CREDIT'
                      ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500'
                      : 'bg-zinc-800/40 text-zinc-400 border-zinc-700'
                  }`}
                >
                  + Credit (Add)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('DEBIT')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition ${
                    adjustType === 'DEBIT'
                      ? 'bg-rose-600/20 text-rose-400 border-rose-500'
                      : 'bg-zinc-800/40 text-zinc-400 border-zinc-700'
                  }`}
                >
                  - Debit (Deduct)
                </button>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="e.g. 100.00"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Reason for Audit Ledger</label>
                <textarea
                  required
                  rows={2}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Credited missing deposit for UTR 123456789012"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {adjustError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs">
                  {adjustError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjusting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  {adjusting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Adjustment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
