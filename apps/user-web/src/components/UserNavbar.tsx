import React from 'react';
import { UserProfile } from '../services/api';
import { PlusCircle, Wallet, ArrowDownLeft, ArrowUpRight, Gamepad2, LogOut, HelpCircle } from 'lucide-react';

export type UserTab = 'lobby' | 'deposit' | 'withdraw' | 'support';

interface UserNavbarProps {
  user: UserProfile;
  balance: number;
  currentTab: UserTab;
  onTabChange: (tab: UserTab) => void;
  onLogout: () => void;
}

export const UserNavbar: React.FC<UserNavbarProps> = ({
  user,
  balance,
  currentTab,
  onTabChange,
  onLogout,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onTabChange('lobby')}>
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-base shadow-xs">
              ₹
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight text-base">MoneyGame</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden sm:flex items-center gap-1.5">
            <button
              onClick={() => onTabChange('lobby')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                currentTab === 'lobby'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Gamepad2 className="w-4 h-4 text-slate-500" />
              <span>Tables</span>
            </button>
            <button
              onClick={() => onTabChange('withdraw')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                currentTab === 'withdraw'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <ArrowUpRight className="w-4 h-4 text-slate-500" />
              <span>Withdraw</span>
            </button>
            <button
              onClick={() => onTabChange('support')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                currentTab === 'support'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <HelpCircle className="w-4 h-4 text-slate-500" />
              <span>Support & Contact</span>
            </button>
          </nav>

          {/* Wallet Balance & Add Cash CTA */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <Wallet className="w-4 h-4 text-emerald-600" />
              <span className="mono-num font-bold text-emerald-800 text-sm">
                ₹{balance.toFixed(2)}
              </span>
            </div>

            <button
              onClick={() => onTabChange('deposit')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Cash</span>
            </button>

            <button
              onClick={onLogout}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition border border-transparent hover:border-slate-200"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="sm:hidden border-t border-slate-200 bg-white px-4 py-2 flex items-center justify-around">
        <button
          onClick={() => onTabChange('lobby')}
          className={`flex items-center gap-1.5 py-1 px-3 text-xs font-semibold rounded-lg ${
            currentTab === 'lobby' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>Tables</span>
        </button>
        <button
          onClick={() => onTabChange('deposit')}
          className={`flex items-center gap-1.5 py-1 px-3 text-xs font-semibold rounded-lg ${
            currentTab === 'deposit' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          <span>Deposit</span>
        </button>
        <button
          onClick={() => onTabChange('withdraw')}
          className={`flex items-center gap-1.5 py-1 px-3 text-xs font-semibold rounded-lg ${
            currentTab === 'withdraw' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>Withdraw</span>
        </button>
        <button
          onClick={() => onTabChange('support')}
          className={`flex items-center gap-1.5 py-1 px-3 text-xs font-semibold rounded-lg ${
            currentTab === 'support' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>Support</span>
        </button>
      </div>
    </header>
  );
};
