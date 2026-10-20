import React, { useState } from 'react';
import { NotificationItem } from '../services/api';
import {
  X,
  Bell,
  CheckCheck,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  Trophy,
  MessageSquare,
  AlertCircle,
  Copy,
  Check,
  Info,
} from 'lucide-react';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  loading?: boolean;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClearAll,
  loading = false,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUtr(text);
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  const filteredNotifications = filter === 'unread'
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  const formatRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 45) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDay === 1) return 'Yesterday';
      if (diffDay < 7) return `${diffDay}d ago`;

      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'WITHDRAWAL_COMPLETED':
        return (
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        );
      case 'WITHDRAWAL_REJECTED':
        return (
          <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
        );
      case 'DEPOSIT_APPROVED':
        return (
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        );
      case 'ROOM_WIN':
        return (
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
        );
      case 'FEEDBACK_REPLY':
        return (
          <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
        );
      default:
        return (
          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
            <Info className="w-5 h-5" />
          </div>
        );
    }
  };

  const getBadge = (type: string) => {
    switch (type) {
      case 'WITHDRAWAL_COMPLETED':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Payout Sent</span>;
      case 'WITHDRAWAL_REJECTED':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">Rejected & Refunded</span>;
      case 'DEPOSIT_APPROVED':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Deposit Credited</span>;
      case 'ROOM_WIN':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Winner</span>;
      case 'FEEDBACK_REPLY':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">Support Reply</span>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Slide-over Drawer */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 animate-slide-left">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                <Bell className="w-5 h-5" />
              </div>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Notifications</h2>
              <p className="text-xs text-slate-400">
                {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                title="Mark all as read"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter pills */}
        <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-lg">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-md transition ${
                filter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 ${
                filter === 'unread'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px]">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {notifications.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-slate-400 hover:text-rose-600 transition flex items-center gap-1 text-[11px]"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear all</span>
            </button>
          )}
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 sm:p-3">
          {loading && notifications.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              Loading notifications...
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="py-16 text-center space-y-3 px-6">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto text-slate-300 shadow-2xs">
                <Bell className="w-7 h-7 text-slate-300" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-700">No notifications</p>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  {filter === 'unread'
                    ? 'You have read all your notifications.'
                    : 'Transaction receipts, payout updates, and table results will appear here.'}
                </p>
              </div>
            </div>
          ) : (
            filteredNotifications.map((n) => {
              const utr = n.metadata?.payoutUtr || n.metadata?.utr;
              return (
                <div
                  key={n.id}
                  onClick={() => !n.isRead && onMarkAsRead(n.id)}
                  className={`group relative p-3 sm:p-3.5 rounded-xl transition cursor-pointer mb-1.5 border ${
                    !n.isRead
                      ? 'bg-emerald-50/40 hover:bg-emerald-50/70 border-emerald-100/80 shadow-2xs'
                      : 'bg-white hover:bg-slate-50 border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {getNotificationIcon(n.type)}

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-bold text-slate-900">
                            {n.title}
                          </h4>
                          {getBadge(n.type)}
                        </div>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap mono-num">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed break-words">
                        {n.message}
                      </p>

                      {/* UTR Copy Badge if available */}
                      {utr && (
                        <div className="pt-1.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(utr);
                            }}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-mono transition"
                            title="Click to copy UTR"
                          >
                            <span className="font-semibold text-slate-500">UTR:</span>
                            <span className="font-bold">{utr}</span>
                            {copiedUtr === utr ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-400" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(n.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-600 rounded transition"
                        title="Delete notification"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
