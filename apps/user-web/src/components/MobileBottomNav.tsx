import React from 'react';
import { UserTab } from './UserNavbar';
import { Gamepad2, Trophy, Wallet, HelpCircle, CandlestickChart } from 'lucide-react';

interface MobileBottomNavProps {
  currentTab: UserTab;
  onTabChange: (tab: UserTab) => void;
  balance: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentTab, onTabChange, balance }) => {
  return (
    <nav
      className={`sm:hidden fixed bottom-0 inset-x-0 z-30 border-t shadow-md pb-[env(safe-area-inset-bottom)] ${currentTab === 'trading' ? 'bg-[#0d1117] border-[#26303d]' : 'bg-white border-slate-200'}`}
    >
      <div className="grid grid-cols-5 h-14">
        <button
          type="button"
          onClick={() => onTabChange('trading')}
          className={`flex flex-col items-center justify-center text-[10px] font-bold ${currentTab === 'trading' ? 'text-emerald-400' : 'text-slate-500'}`}
        >
          <CandlestickChart className="w-5 h-5" />
          CricTrade
        </button>
        {/* Tables */}
        <button
          type="button"
          onClick={() => onTabChange('lobby')}
          className={`flex flex-col items-center justify-center gap-0.5 transition cursor-pointer select-none ${
            currentTab === 'lobby'
              ? 'text-slate-900 font-bold'
              : 'text-slate-500 hover:text-slate-700 font-medium'
          }`}
        >
          <div className="relative">
            <Gamepad2 className="w-5 h-5" />
            {currentTab === 'lobby' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-slate-900" />
            )}
          </div>
          <span className="text-[10px]">Tables</span>
        </button>

        {/* Live Sports */}
        <button
          type="button"
          onClick={() => onTabChange('sports')}
          className={`flex flex-col items-center justify-center gap-0.5 transition cursor-pointer select-none ${
            currentTab === 'sports'
              ? 'text-slate-900 font-bold'
              : 'text-slate-500 hover:text-slate-700 font-medium'
          }`}
        >
          <div className="relative">
            <Trophy className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            {currentTab === 'sports' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-slate-900" />
            )}
          </div>
          <span className="text-[10px]">Sports</span>
        </button>

        {/* Wallet */}
        <button
          type="button"
          onClick={() => onTabChange('wallet')}
          className={`flex flex-col items-center justify-center gap-0.5 transition cursor-pointer select-none ${
            currentTab === 'wallet'
              ? 'text-emerald-700 font-bold'
              : 'text-slate-500 hover:text-slate-700 font-medium'
          }`}
        >
          <div className="relative">
            <Wallet className="w-5 h-5" />
            {currentTab === 'wallet' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-600" />
            )}
          </div>
          <span className="text-[10px] font-mono tabular-nums">
            {currentTab === 'trading' ? 'Wallet' : `₹${balance.toFixed(0)}`}
          </span>
        </button>

        {/* Support */}
        <button
          type="button"
          onClick={() => onTabChange('support')}
          className={`flex flex-col items-center justify-center gap-0.5 transition cursor-pointer select-none ${
            currentTab === 'support'
              ? 'text-slate-900 font-bold'
              : 'text-slate-500 hover:text-slate-700 font-medium'
          }`}
        >
          <div className="relative">
            <HelpCircle className="w-5 h-5" />
            {currentTab === 'support' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-slate-900" />
            )}
          </div>
          <span className="text-[10px]">Support</span>
        </button>
      </div>
    </nav>
  );
};
