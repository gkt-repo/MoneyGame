import React from 'react';
import { UserProfile } from '../services/api';
import { Wallet, Gamepad2, LogOut, HelpCircle, Trophy, RotateCw, Bell } from 'lucide-react';

export type UserTab = 'lobby' | 'sports' | 'wallet' | 'support';

interface UserNavbarProps {
  user: UserProfile;
  balance: number;
  currentTab: UserTab;
  onTabChange: (tab: UserTab) => void;
  onLogout: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
}

export const UserNavbar: React.FC<UserNavbarProps> = ({
  user,
  balance,
  currentTab,
  onTabChange,
  onLogout,
  onRefresh,
  isRefreshing = false,
  onOpenNotifications,
  unreadNotificationsCount = 0,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onTabChange('lobby')}>
            <img src="/logo.png" alt="MoneyGame" className="w-8 h-8 rounded-lg object-contain shadow-2xs border border-slate-200" />
            <div>
              <span className="font-extrabold text-slate-900 tracking-wider text-sm sm:text-base uppercase">
                MoneyGame
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden sm:flex items-center gap-1.5">
            <button
              onClick={() => onTabChange('lobby')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                currentTab === 'lobby'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Gamepad2 className="w-4 h-4 text-slate-500" />
              <span>Tables</span>
            </button>
            <button
              onClick={() => onTabChange('sports')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                currentTab === 'sports'
                  ? 'bg-indigo-50 text-indigo-900 font-bold border border-indigo-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Trophy className="w-4 h-4 text-indigo-600" />
              <span className="flex items-center gap-1.5">
                <span>Live Sports</span>
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              </span>
            </button>
            <button
              onClick={() => onTabChange('wallet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                currentTab === 'wallet'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Wallet className="w-4 h-4 text-slate-500" />
              <span>My Wallet</span>
            </button>
            <button
              onClick={() => onTabChange('support')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                currentTab === 'support'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <HelpCircle className="w-4 h-4 text-slate-500" />
              <span>Support & Contact</span>
            </button>
          </nav>

          {/* Live Wallet Pill (Clickable Hub with quick + indicator, no redundant duplicate buttons) & Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Refresh balance and tables"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            )}

            <button
              onClick={() => onTabChange('wallet')}
              title="Open My Wallet & Ledger"
              className="group flex items-center gap-2 pl-3 pr-1.5 py-1 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-600/30 rounded-full transition shadow-xs cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              <span className="mono-num font-bold text-emerald-900 text-xs sm:text-sm">
                ₹{balance.toFixed(2)}
              </span>
              <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs transition group-hover:scale-105">
                +
              </div>
            </button>

            {/* Notification Bell */}
            <button
              onClick={onOpenNotifications}
              title="Notifications"
              className="relative p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition border border-transparent hover:border-slate-200 cursor-pointer"
            >
              <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>

            <button
              onClick={onLogout}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition border border-transparent hover:border-slate-200 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation (Streamlined 4 tabs) */}
      <div className="sm:hidden border-t border-slate-200 bg-white px-2 py-2 flex items-center justify-around">
        <button
          onClick={() => onTabChange('lobby')}
          className={`flex items-center gap-1 py-1 px-2 text-xs font-semibold rounded-lg ${
            currentTab === 'lobby' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>Tables</span>
        </button>
        <button
          onClick={() => onTabChange('sports')}
          className={`flex items-center gap-1 py-1 px-2 text-xs font-semibold rounded-lg ${
            currentTab === 'sports' ? 'bg-indigo-50 text-indigo-900 font-bold' : 'text-slate-500'
          }`}
        >
          <Trophy className="w-4 h-4 text-indigo-600" />
          <span>Sports</span>
        </button>
        <button
          onClick={() => onTabChange('wallet')}
          className={`flex items-center gap-1 py-1 px-2 text-xs font-semibold rounded-lg ${
            currentTab === 'wallet' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Wallet</span>
        </button>
        <button
          onClick={() => onTabChange('support')}
          className={`flex items-center gap-1 py-1 px-2 text-xs font-semibold rounded-lg ${
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
