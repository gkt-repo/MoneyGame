import React from 'react';
import { UserProfile } from '../services/api';
import { AVATAR_ICONS } from './ProfileModal';
import { Wallet, Gamepad2, LogOut, HelpCircle, Trophy, RotateCw, Bell, User } from 'lucide-react';

export type UserTab = 'profile' | 'history' | 'lobby' | 'sports' | 'wallet' | 'support' | 'trading';

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
  onOpenProfile?: () => void;
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
  onOpenProfile,
}) => {
  const isDark = currentTab === 'trading';

  return (
    <header className={`${isDark ? 'bg-[#101c2b] border-[#1d2b3d] text-slate-100' : 'bg-white border-slate-200 text-slate-900'} border-b sticky top-0 z-30 shadow-xs transition-colors duration-200`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex shrink-0 items-center gap-2.5 cursor-pointer" onClick={() => onTabChange('lobby')}>
            <img src="/logo.png" alt="MoneyGame" className={`w-8 h-8 rounded-lg object-contain shadow-2xs border ${isDark ? 'border-slate-700' : 'border-slate-200'}`} />
            <div className="hidden sm:block">
              <span className={`font-extrabold tracking-wider text-sm sm:text-base uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>
                MoneyGame
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1.5 whitespace-nowrap">
            <button
              type="button"
              onClick={() => onTabChange('trading')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
                currentTab === 'trading'
                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40 font-bold'
                  : isDark
                  ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              CricTrade
            </button>
            <button
              onClick={() => onTabChange('lobby')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
                currentTab === 'lobby'
                  ? isDark ? 'bg-slate-800 text-white font-bold' : 'bg-slate-100 text-slate-900 font-bold'
                  : isDark
                  ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Gamepad2 className="w-4 h-4 text-slate-400" />
              <span>Tables</span>
            </button>
            <button
              onClick={() => onTabChange('sports')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
                currentTab === 'sports'
                  ? isDark
                    ? 'bg-indigo-950/70 text-indigo-300 font-bold ring-1 ring-indigo-500/40'
                    : 'bg-indigo-50 text-indigo-900 font-bold border border-indigo-200/60'
                  : isDark
                  ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Trophy className="w-4 h-4 text-indigo-400" />
              <span className="flex items-center gap-1.5">
                <span>Live Sports</span>
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              </span>
            </button>

            <button
              onClick={() => onTabChange('wallet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
                currentTab === 'wallet'
                  ? isDark ? 'bg-slate-800 text-white font-bold' : 'bg-slate-100 text-slate-900 font-bold'
                  : isDark
                  ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Wallet className="w-4 h-4 text-slate-400" />
              <span>My Wallet</span>
            </button>
            <button
              onClick={() => onTabChange('support')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
                currentTab === 'support'
                  ? isDark ? 'bg-slate-800 text-white font-bold' : 'bg-slate-100 text-slate-900 font-bold'
                  : isDark
                  ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <HelpCircle className="w-4 h-4 text-slate-400" />
              <span>Support & Contact</span>
            </button>
          </nav>

          {/* Live Wallet Pill & Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Refresh balance and tables"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer disabled:opacity-50 shadow-2xs border ${
                  isDark
                    ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
                    : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border-slate-200'
                }`}
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : 'text-slate-400'}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            )}

            {/* User Profile Button */}
            {onOpenProfile && (
              <button
                onClick={onOpenProfile}
                title="View & Edit Player Profile"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition cursor-pointer border shadow-2xs ${
                  isDark
                    ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
                    : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border-slate-200'
                }`}
              >
                <span className="text-sm leading-none">
                  {AVATAR_ICONS[user.avatar || 'avatar_1'] || '🦁'}
                </span>
                <span className="text-xs font-bold hidden md:inline truncate max-w-[100px]">
                  {user.displayName || user.username}
                </span>
              </button>
            )}

            <button
              onClick={() => onTabChange('wallet')}
              title="Open My Wallet & Ledger"
              className={`group flex items-center gap-2 pl-3 pr-1.5 py-1 rounded-full transition shadow-xs cursor-pointer border ${
                isDark
                  ? 'bg-emerald-950/50 hover:bg-emerald-900/60 border-emerald-500/30 text-emerald-300'
                  : 'bg-emerald-50 hover:bg-emerald-100/80 border-emerald-600/30 text-emerald-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="mono-num tabular-nums font-bold text-xs sm:text-sm">
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
              className={`relative p-2 rounded-xl transition border cursor-pointer ${
                isDark
                  ? 'text-slate-300 hover:text-white hover:bg-slate-800/80 border-transparent hover:border-slate-700'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 border-transparent hover:border-slate-200'
              }`}
            >
              <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-slate-900">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>

            <button
              onClick={onLogout}
              title="Sign Out"
              className={`p-1.5 rounded-lg transition border cursor-pointer ${
                isDark
                  ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 border-transparent hover:border-slate-700'
                  : 'text-slate-400 hover:text-red-600 hover:bg-slate-100 border-transparent hover:border-slate-200'
              }`}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Compact navigation for tablet widths (hidden on mobile phone screens where bottom nav is present). */}
      <div className={`hidden sm:flex lg:hidden border-t px-2 py-2 items-center justify-around ${isDark ? 'bg-[#0d1722] border-[#1d2b3d]' : 'bg-white border-slate-200'}`}>
        <button
          type="button"
          onClick={() => onTabChange('trading')}
          className={`py-1 px-2.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
            currentTab === 'trading'
              ? 'bg-emerald-500/20 text-emerald-300 font-bold'
              : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          CricTrade
        </button>
        <button
          onClick={() => onTabChange('lobby')}
          className={`flex items-center gap-1 py-1 px-2.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
            currentTab === 'lobby'
              ? isDark ? 'bg-slate-800 text-white font-bold' : 'bg-slate-100 text-slate-900 font-bold'
              : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>Tables</span>
        </button>
        <button
          onClick={() => onTabChange('sports')}
          className={`flex items-center gap-1 py-1 px-2.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
            currentTab === 'sports'
              ? isDark ? 'bg-indigo-950/70 text-indigo-300 font-bold' : 'bg-indigo-50 text-indigo-900 font-bold'
              : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Trophy className="w-4 h-4 text-indigo-500" />
          <span>Sports</span>
        </button>
        <button
          onClick={() => onTabChange('wallet')}
          className={`flex items-center gap-1 py-1 px-2.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
            currentTab === 'wallet'
              ? isDark ? 'bg-slate-800 text-white font-bold' : 'bg-emerald-50 text-emerald-800 font-bold'
              : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Wallet</span>
        </button>
        <button
          onClick={() => onTabChange('support')}
          className={`flex items-center gap-1 py-1 px-2.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
            currentTab === 'support'
              ? isDark ? 'bg-slate-800 text-white font-bold' : 'bg-slate-100 text-slate-900 font-bold'
              : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>Support</span>
        </button>
      </div>
    </header>
  );
};
