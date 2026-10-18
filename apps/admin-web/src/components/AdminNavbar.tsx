import React from 'react';
import { AdminUser } from '../services/api';
import {
  ShieldCheck,
  LayoutDashboard,
  ArrowDownLeft,
  ArrowUpRight,
  Gamepad2,
  Settings,
  LogOut,
  Users,
  MessageSquare,
} from 'lucide-react';

export type AdminTab = 'overview' | 'users' | 'deposits' | 'withdrawals' | 'rooms' | 'feedback' | 'settings';

interface AdminNavbarProps {
  currentTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  admin: AdminUser;
  onLogout: () => void;
  pendingCount: number;
  openFeedbacksCount?: number;
}

export const AdminNavbar: React.FC<AdminNavbarProps> = ({
  currentTab,
  onTabChange,
  admin,
  onLogout,
  pendingCount,
  openFeedbacksCount,
}) => {
  const tabs = [
    { id: 'overview' as AdminTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'users' as AdminTab, label: 'Users', icon: Users },
    { id: 'deposits' as AdminTab, label: 'Deposits', icon: ArrowDownLeft },
    {
      id: 'withdrawals' as AdminTab,
      label: 'Withdrawals',
      icon: ArrowUpRight,
      badge: pendingCount > 0 ? pendingCount : null,
    },
    { id: 'rooms' as AdminTab, label: 'Live Games', icon: Gamepad2 },
    {
      id: 'feedback' as AdminTab,
      label: 'Support',
      icon: MessageSquare,
      badge: openFeedbacksCount && openFeedbacksCount > 0 ? openFeedbacksCount : null,
    },
    { id: 'settings' as AdminTab, label: 'Settings', icon: Settings },
  ];

  return (
    <header className="border-b border-zinc-800 bg-zinc-900 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-zinc-100 tracking-tight text-base">MoneyGame</span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 bg-zinc-800 text-emerald-400 border border-zinc-700 rounded">
                  Admin
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                    active
                      ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-emerald-400' : 'text-zinc-400'}`} />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Action: User & Logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-medium text-zinc-200">{admin.username}</span>
              <span className="text-[11px] text-zinc-500">{admin.email || admin.role}</span>
            </div>

            <button
              onClick={onLogout}
              title="Sign Out"
              className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className="md:hidden border-t border-zinc-800 px-2 py-2 flex items-center justify-around bg-zinc-900/90">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center py-1 px-2 text-xs font-medium relative ${
                active ? 'text-emerald-400' : 'text-zinc-400'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="absolute top-0 right-1 w-2 h-2 bg-amber-400 rounded-full"></span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
