import React, { useState, useEffect, useCallback } from 'react';
import { adminApi, FeedbackItem } from '../services/api';
import { UserProfileModal } from '../components/UserProfileModal';
import {
  MessageSquare,
  Search,
  RefreshCw,
  Send,
  CheckCircle2,
  Clock,
  User,
  SlidersHorizontal,
  Loader2,
  ExternalLink,
  Phone,
  Mail,
  Wallet,
} from 'lucide-react';

export const FeedbackView: React.FC = () => {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Replying state
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'>('RESOLVED');
  const [submitting, setSubmitting] = useState(false);

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getFeedbacks(statusFilter);
      setFeedbacks(data);
    } catch (err) {
      console.error('Error fetching feedbacks:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const handleSendReply = async (feedbackId: string) => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      await adminApi.replyFeedback(feedbackId, replyText.trim(), replyStatus);
      setReplyingId(null);
      setReplyText('');
      await fetchFeedbacks();
    } catch (err: any) {
      alert(`Error replying: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const openTicketsCount = feedbacks.filter((f) => f.status === 'OPEN').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Support & Feedback</h1>
            {openTicketsCount > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                {openTicketsCount} pending
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Review user feedback, answer support tickets, and jump straight into user profiles to solve issues
          </p>
        </div>

        <button
          onClick={fetchFeedbacks}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-xl text-sm font-medium transition self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : 'text-zinc-400'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Ribbon */}
      <div className="flex flex-wrap items-center gap-2">
        {['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              statusFilter === st
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            {st === 'ALL' ? 'All Tickets' : st.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Feedbacks List */}
      {loading && feedbacks.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mb-2" />
          <p className="text-sm">Loading support tickets...</p>
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="p-12 text-center bg-zinc-900 border border-zinc-800 rounded-2xl">
          <MessageSquare className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-zinc-300">No tickets found</h3>
          <p className="text-xs text-zinc-500 mt-1">
            No feedback or support requests match the selected status filter.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedbacks.map((item) => (
            <div
              key={item.id}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4 hover:border-zinc-700/80 transition"
            >
              {/* Ticket Top Meta */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-emerald-400 font-bold text-sm shrink-0">
                    {item.user?.username.slice(0, 2).toUpperCase() || <User className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedUserId(item.userId)}
                        className="font-bold text-zinc-100 hover:text-emerald-400 text-sm flex items-center gap-1.5 transition"
                        title="Click to view full user profile"
                      >
                        <span>{item.user?.username || 'Unknown User'}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-zinc-500 hover:text-emerald-400" />
                      </button>
                      {item.user?.wallet && (
                        <span className="text-xs text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.2 rounded">
                          ₹{item.user.wallet.balance.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 mt-0.5">
                      {item.user?.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {item.user.phone}
                        </span>
                      )}
                      {item.user?.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {item.user.email}
                        </span>
                      )}
                      <span>•</span>
                      <span>Submitted {new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-xs font-semibold px-2 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded uppercase">
                    {item.category}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      item.status === 'RESOLVED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : item.status === 'IN_PROGRESS'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                        : item.status === 'OPEN'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {item.status}
                  </span>
                  <button
                    onClick={() => setSelectedUserId(item.userId)}
                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium flex items-center gap-1 transition"
                    title="Inspect user profile"
                  >
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden md:inline">Inspect User</span>
                  </button>
                </div>
              </div>

              {/* Message Content */}
              <div className="space-y-2">
                <h4 className="font-semibold text-zinc-100 text-sm sm:text-base">{item.subject}</h4>
                <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5 text-xs sm:text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {item.message}
                </div>
                {item.contactInfo && (
                  <div className="text-xs text-zinc-400 flex items-center gap-2 pt-1">
                    <span className="text-zinc-500">User Contact Reference:</span>
                    <span className="font-mono text-zinc-200 bg-zinc-800 px-2 py-0.5 rounded">
                      {item.contactInfo}
                    </span>
                  </div>
                )}
              </div>

              {/* Admin Reply Section */}
              {item.adminReply && (
                <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-xl p-4 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Admin Resolution / Reply
                    </span>
                    {item.repliedAt && (
                      <span className="text-zinc-500 font-normal">
                        {new Date(item.repliedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-200 whitespace-pre-wrap">{item.adminReply}</p>
                </div>
              )}

              {/* Reply Form */}
              {replyingId === item.id ? (
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <h5 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Respond to User
                  </h5>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Enter reply message or resolution details (e.g. 'Your UTR 123456789 has been verified and ₹500 credited to your wallet. Thank you!')..."
                    rows={3}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-400">Update Status To:</span>
                      <select
                        value={replyStatus}
                        onChange={(e) => setReplyStatus(e.target.value as any)}
                        className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded-lg px-2.5 py-1.5 font-medium"
                      >
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setReplyingId(null)}
                        className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSendReply(item.id)}
                        disabled={submitting || !replyText.trim()}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                      >
                        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>Submit Reply</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => {
                      setReplyingId(item.id);
                      setReplyText(item.adminReply || '');
                    }}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-zinc-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{item.adminReply ? 'Edit Response' : 'Reply & Resolve'}</span>
                  </button>

                  <button
                    onClick={() => setSelectedUserId(item.userId)}
                    className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                  >
                    <span>View User Account Telemetry &rarr;</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* User Profile Modal */}
      {selectedUserId && (
        <UserProfileModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onUserUpdated={fetchFeedbacks}
        />
      )}
    </div>
  );
};
