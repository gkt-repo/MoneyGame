import React, { useState } from 'react';
import { DepositItem } from '../services/api';
import { ArrowDownLeft, Clock, CheckCircle2, XCircle, Search } from 'lucide-react';

interface DepositsViewProps {
  deposits: DepositItem[];
  loading: boolean;
  onRefresh: () => void;
  onSelectUser?: (userId: string) => void;
}

export const DepositsView: React.FC<DepositsViewProps> = ({ deposits, loading, onRefresh, onSelectUser }) => {
  const [filter, setFilter] = useState<'ALL' | 'APPROVED' | 'PENDING' | 'EXPIRED'>('ALL');
  const [search, setSearch] = useState('');

  const filtered = deposits.filter((d) => {
    if (filter !== 'ALL' && d.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchUtr = d.utr?.toLowerCase().includes(q);
      const matchUser = d.user?.username.toLowerCase().includes(q);
      const matchPhone = d.user?.phone?.includes(q);
      const matchAmount = d.totalAmount.toString().includes(q);
      return matchUtr || matchUser || matchPhone || matchAmount;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
            <CheckCircle2 className="w-3 h-3" />
            Approved
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
            Expired
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 tracking-tight">Deposit Ledger</h2>
          <p className="text-sm text-zinc-400">All dynamic UPI payment requests and auto-approvals.</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 p-1 rounded-lg self-start sm:self-auto">
          {(['ALL', 'APPROVED', 'PENDING', 'EXPIRED'] as const).map((tab) => (
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

      {/* Deposits Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950/60 border-b border-zinc-800 text-zinc-400 text-xs uppercase font-medium">
              <tr>
                <th className="px-5 py-3.5">Created At</th>
                <th className="px-5 py-3.5">Player</th>
                <th className="px-5 py-3.5">Base Fee</th>
                <th className="px-5 py-3.5">Payable (Paise Offset)</th>
                <th className="px-5 py-3.5">Bank UTR</th>
                <th className="px-5 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-300">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-zinc-500">
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
                        className={`font-medium text-zinc-200 ${onSelectUser ? 'hover:text-emerald-400 cursor-pointer transition' : ''}`}
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
                    <td className="px-5 py-3.5 mono-num text-xs text-zinc-400">
                      {d.utr ? (
                        <span className="bg-zinc-950 px-2 py-1 rounded border border-zinc-800 text-zinc-300">
                          {d.utr}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">{getStatusBadge(d.status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
