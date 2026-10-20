import React, { useState, useEffect, useCallback } from 'react';
import { userApi, UserProfile, TransactionItem } from '../services/api';
import { AddCashView } from './AddCashView';
import { WithdrawView } from './WithdrawView';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Trophy,
  Gamepad2,
  RotateCcw,
  PlusCircle,
  MinusCircle,
  Receipt,
  User,
  Phone,
  Mail,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ArrowLeft,
  Coins,
} from 'lucide-react';

interface WalletViewProps {
  user: UserProfile;
  balance: number;
  lockedBalance: number;
  onRefreshBalance: () => void;
  initialSubView?: 'overview' | 'deposit' | 'withdraw';
}

export const WalletView: React.FC<WalletViewProps> = ({
  user,
  balance,
  lockedBalance,
  onRefreshBalance,
  initialSubView = 'overview',
}) => {
  const [subView, setSubView] = useState<'overview' | 'deposit' | 'withdraw'>(initialSubView);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load transaction passbook
  const loadTransactions = useCallback(async () => {
    try {
      setLoadingTransactions(true);
      const items = await userApi.getMyTransactions();
      setTransactions(items);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await Promise.all([onRefreshBalance(), loadTransactions()]);
    setRefreshing(false);
  };

  const getTransactionIcon = (type: string, amount?: number) => {
    switch (type) {
      case 'DEPOSIT':
        return <ArrowDownLeft className="w-4 h-4 text-emerald-600" />;
      case 'ROOM_WIN':
        return <Trophy className="w-4 h-4 text-amber-500" />;
      case 'ROOM_ENTRY':
      case 'ROOM_BET':
        return <Gamepad2 className="w-4 h-4 text-slate-500" />;
      case 'WITHDRAWAL_LOCK':
        return <ArrowUpRight className="w-4 h-4 text-red-500" />;
      case 'WITHDRAWAL_COMPLETE':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'REFUND':
        return <RotateCcw className="w-4 h-4 text-blue-500" />;
      case 'MANUAL_CREDIT':
        return <PlusCircle className="w-4 h-4 text-emerald-600" />;
      case 'MANUAL_DEBIT':
        return <MinusCircle className="w-4 h-4 text-red-500" />;
      case 'MANUAL_ADJUST':
        return amount !== undefined && amount >= 0 ? (
          <PlusCircle className="w-4 h-4 text-emerald-600" />
        ) : (
          <MinusCircle className="w-4 h-4 text-red-500" />
        );
      default:
        return amount !== undefined && amount >= 0 ? (
          <PlusCircle className="w-4 h-4 text-emerald-600" />
        ) : (
          <Coins className="w-4 h-4 text-slate-500" />
        );
    }
  };

  const isCredit = (type: string, amount?: number) => {
    if (amount !== undefined) {
      if (amount > 0) return true;
      if (amount < 0) return false;
    }
    return ['DEPOSIT', 'ROOM_WIN', 'REFUND', 'MANUAL_CREDIT'].includes(type);
  };

  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  // If in Add Cash sub-view
  if (subView === 'deposit') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => {
            setSubView('overview');
            onRefreshBalance();
            loadTransactions();
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Wallet</span>
        </button>
        <AddCashView
          user={user}
          onPaymentSuccess={() => {
            onRefreshBalance();
            loadTransactions();
            setSubView('overview');
          }}
        />
      </div>
    );
  }

  // If in Withdraw sub-view
  if (subView === 'withdraw') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => {
            setSubView('overview');
            onRefreshBalance();
            loadTransactions();
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Wallet</span>
        </button>
        <WithdrawView
          user={user}
          balance={balance}
          lockedBalance={lockedBalance}
          onWithdrawSuccess={() => {
            onRefreshBalance();
            loadTransactions();
          }}
        />
      </div>
    );
  }

  // Main Wallet Overview
  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* ─── 1. BALANCE OVERVIEW CARD ─── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">
              Total Wallet Balance
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="p-1.5 text-slate-400 hover:text-slate-700 transition rounded-lg hover:bg-slate-50"
            title="Refresh balance and transactions"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>

        <div>
          <div className="text-3xl sm:text-4xl font-extrabold mono-num text-slate-900">
            ₹{balance.toFixed(2)}
          </div>
          {lockedBalance > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 font-semibold mt-1">
              <Lock className="w-3.5 h-3.5" />
              <span>₹{lockedBalance.toFixed(2)} currently locked in pending withdrawal</span>
            </div>
          )}
        </div>

        {/* Action Buttons: Add Cash & Withdraw */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => setSubView('deposit')}
            className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition shadow-xs cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Cash</span>
          </button>
          <button
            onClick={() => setSubView('withdraw')}
            className="flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-sm font-bold transition shadow-xs cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4 text-slate-600" />
            <span>Withdraw</span>
          </button>
        </div>
      </div>

      {/* ─── 2. TRANSACTION PASSBOOK / ACTIVITY ─── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold tracking-wider uppercase text-slate-500">
              Transaction Passbook
            </h3>
          </div>
          <button
            onClick={loadTransactions}
            disabled={loadingTransactions}
            className="p-1 text-slate-400 hover:text-slate-700 transition rounded hover:bg-slate-50"
            title="Refresh passbook"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingTransactions ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>

        {loadingTransactions && transactions.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin text-emerald-600 mb-2" />
            <span className="text-xs">Loading ledger activity...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-300">
              <Receipt className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No transactions recorded yet</p>
            <p className="text-xs text-slate-400">
              Add cash or enter a room to view your ledger activity.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto pr-1">
            {transactions.map((tx) => {
              const credit = isCredit(tx.type, tx.amount);
              const isZero = tx.amount === 0;
              const sign = isZero ? '' : credit ? '+' : '-';
              return (
                <div key={tx.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        tx.type === 'WITHDRAWAL_COMPLETE'
                          ? 'bg-emerald-50 border-emerald-100'
                          : isZero
                          ? 'bg-slate-50 border-slate-200'
                          : credit
                          ? 'bg-emerald-50 border-emerald-100'
                          : 'bg-red-50 border-red-100'
                      }`}
                    >
                      {getTransactionIcon(tx.type, tx.amount)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {tx.description || tx.type}
                      </div>
                      <div className="text-[11px] text-slate-400 mono-num">
                        {formatDate(tx.createdAt)}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`text-sm font-bold mono-num shrink-0 ${
                      tx.type === 'WITHDRAWAL_COMPLETE'
                        ? 'text-emerald-600'
                        : isZero
                        ? 'text-slate-600'
                        : credit
                        ? 'text-emerald-600'
                        : 'text-red-600'
                    }`}
                  >
                    {tx.type === 'WITHDRAWAL_COMPLETE' && isZero ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 tracking-wide">
                        PAID
                      </span>
                    ) : (
                      `${sign}₹${Math.abs(tx.amount).toFixed(2)}`
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 3. USER ACCOUNT DETAILS CARD ─── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <h3 className="text-xs font-bold tracking-wider uppercase text-slate-500">
          Account Details
        </h3>

        <div className="divide-y divide-slate-100 text-xs">
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-slate-500 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              <span>Username</span>
            </span>
            <span className="font-semibold text-slate-900">{user.username}</span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" />
              <span>Mobile Number</span>
            </span>
            <span className="font-mono font-semibold text-slate-900">
              {user.phone || 'Not linked'}
            </span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              <span>Recovery Email</span>
            </span>
            <span className="font-semibold text-slate-900 truncate max-w-[200px]">
              {user.email || 'Not linked'}
            </span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <span className="text-slate-500">Account Status</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {user.status || 'ACTIVE'}
            </span>
          </div>
        </div>
      </div>

      {/* ─── 4. FINANCIAL SECURITY GUARANTEE ─── */}
      <div className="p-4 bg-slate-100/80 border border-slate-200 rounded-xl flex items-start gap-3 text-xs text-slate-600">
        <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-slate-800">Direct UPI Settlement:</strong> Deposits use unique paise
          offsets for instant automated verification. Withdrawals are cleared manually via Super Admin
          IMPS UTR.
        </p>
      </div>
    </div>
  );
};
