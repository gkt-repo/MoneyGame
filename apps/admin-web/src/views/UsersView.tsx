import React, { useState, useEffect, useCallback } from 'react';
import { adminApi, UserAdminListItem } from '../services/api';
import { UserProfileModal } from '../components/UserProfileModal';
import {
  Users,
  Search,
  RefreshCw,
  Eye,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  ShieldCheck,
  Ban,
  Gamepad2,
  Phone,
  Mail,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';

interface UsersViewProps {
  onSelectUser?: (userId: string) => void;
}

export const UsersView: React.FC<UsersViewProps> = () => {
  const [users, setUsers] = useState<UserAdminListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsers(searchQuery, statusFilter);
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">User Management</h1>
            <span className="px-2 py-0.5 text-xs font-semibold bg-zinc-800 text-zinc-300 rounded-full border border-zinc-700">
              {users.length} {users.length === 1 ? 'user' : 'users'}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Search, view user profiles, inspect wallet transactions, resolve issues, and adjust balances
          </p>
        </div>

        <button
          onClick={fetchUsers}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-xl text-sm font-medium transition self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : 'text-zinc-400'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username, phone, email, or user ID..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500 transition"
          />
        </form>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-400">
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-zinc-200 text-xs font-medium focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="BANNED">Banned</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        {loading && users.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mb-2" />
            <p className="text-sm">Loading users directory...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-zinc-300">No users found</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              Try refining your search query or reset the status filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 uppercase text-[11px] font-semibold tracking-wider">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Wallet Balance</th>
                  <th className="py-3 px-4">Deposits / Withdrawals</th>
                  <th className="py-3 px-4">Games</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-zinc-800/40 transition cursor-pointer group"
                    onClick={() => setSelectedUserId(u.id)}
                  >
                    {/* User Identity */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0 group-hover:border-emerald-500/50 transition">
                          {u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                            <span>{u.username}</span>
                            {u.role !== 'USER' && (
                              <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-zinc-800 text-emerald-400 border border-zinc-700">
                                {u.role}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-zinc-500 block">
                            ID: {u.id.slice(0, 10)}...
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Contact Info */}
                    <td className="py-3.5 px-4 text-zinc-400">
                      <div className="space-y-0.5">
                        {u.phone ? (
                          <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                            <Phone className="w-3 h-3 text-zinc-500" />
                            <span>{u.phone}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-600 text-xs">No phone</span>
                        )}
                        {u.email && (
                          <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                            <Mail className="w-3 h-3 text-zinc-500" />
                            <span className="truncate max-w-[150px]">{u.email}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Wallet */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-emerald-400">
                        ₹{u.balance.toFixed(2)}
                      </div>
                      {u.lockedBalance > 0 && (
                        <div className="text-[11px] text-amber-400">
                          Locked: ₹{u.lockedBalance.toFixed(2)}
                        </div>
                      )}
                    </td>

                    {/* Deposits / Withdrawals */}
                    <td className="py-3.5 px-4 text-zinc-300">
                      <div className="space-y-0.5 text-xs">
                        <div className="text-emerald-400 font-medium">
                          +{u.totalDepositsCount} dep (₹{u.totalDepositedAmount.toFixed(2)})
                        </div>
                        <div className="text-zinc-400">
                          -{u.totalWithdrawalsCount} with (₹{u.totalWithdrawnAmount.toFixed(2)})
                        </div>
                      </div>
                    </td>

                    {/* Games */}
                    <td className="py-3.5 px-4 text-zinc-300">
                      <div className="text-xs">
                        <span className="font-semibold text-zinc-200">{u.roomsPlayedCount} played</span>
                        <div className="text-zinc-400 text-[11px]">
                          {u.roomsWonCount} won
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : u.status === 'SUSPENDED'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {u.status === 'ACTIVE' ? (
                          <ShieldCheck className="w-3 h-3" />
                        ) : u.status === 'SUSPENDED' ? (
                          <ShieldAlert className="w-3 h-3" />
                        ) : (
                          <Ban className="w-3 h-3" />
                        )}
                        <span>{u.status}</span>
                      </span>
                    </td>

                    {/* Joined */}
                    <td className="py-3.5 px-4 text-zinc-500 text-xs whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUserId(u.id);
                        }}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-emerald-600/20 text-zinc-300 hover:text-emerald-400 border border-zinc-700 hover:border-emerald-500/40 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Profile</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      {selectedUserId && (
        <UserProfileModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onUserUpdated={fetchUsers}
        />
      )}
    </div>
  );
};
