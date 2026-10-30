import React, { useState, useEffect } from 'react';
import { PublicProfileDTO } from '@moneygame/shared-types';
import { userApi } from '../services/api';
import { AVATAR_ICONS } from './ProfileModal';
import { X, Trophy, Flame, Calendar, Gamepad2, Shield, Loader2 } from 'lucide-react';

interface PublicProfileModalProps {
  userId: string | null;
  onClose: () => void;
}

export const PublicProfileModal: React.FC<PublicProfileModalProps> = ({
  userId,
  onClose,
}) => {
  const [profile, setProfile] = useState<PublicProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      loadPublicProfile(userId);
    } else {
      setProfile(null);
    }
  }, [userId]);

  const loadPublicProfile = async (targetUserId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await userApi.getPublicProfile(targetUserId);
      setProfile(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load player profile');
    } finally {
      setLoading(false);
    }
  };

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-800">Player Card</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="py-10 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
              <span className="text-xs">Loading player details...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm text-center">
              {error}
            </div>
          ) : profile ? (
            <>
              {/* Avatar & Display Name */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center text-3xl">
                  {AVATAR_ICONS[profile.avatar] || '🦁'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{profile.displayName}</h3>
                  <p className="text-xs font-mono text-slate-500">@{profile.username}</p>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1">
                    <Calendar className="w-3 h-3" />
                    <span>Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              {/* Career Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-center">
                  <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
                    <Gamepad2 className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-medium">Played</span>
                  </div>
                  <span className="text-xl font-mono font-bold text-slate-900">
                    {profile.stats.totalGames}
                  </span>
                </div>

                <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200/60 text-center">
                  <div className="flex items-center justify-center gap-1 text-emerald-700 mb-1">
                    <Trophy className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-medium">Won</span>
                  </div>
                  <span className="text-xl font-mono font-bold text-emerald-700">
                    {profile.stats.totalWins}
                  </span>
                </div>

                <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/60 text-center">
                  <div className="flex items-center justify-center gap-1 text-amber-700 mb-1">
                    <Flame className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-medium">Win Rate</span>
                  </div>
                  <span className="text-xl font-mono font-bold text-amber-700">
                    {profile.stats.winRatePercent}%
                  </span>
                </div>
              </div>

              {/* Per Game Stats */}
              {Object.keys(profile.stats.byGame).length > 0 && (
                <div className="space-y-1.5 text-xs">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Breakdown
                  </label>
                  {Object.entries(profile.stats.byGame).map(([game, g]) => (
                    <div
                      key={game}
                      className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200/60"
                    >
                      <span className="font-semibold text-slate-700">
                        {game === 'SEEP' ? '♠ Seep' : game === 'TWENTY_NINE'
                          ? '29 Card Game'
                          : game === 'TEEN_PATTI'
                          ? 'Teen Patti'
                          : game === 'SPORTS_MATCH'
                          ? 'Sports Match'
                          : 'Guess Number'}
                      </span>
                      <div className="flex items-center gap-3 text-slate-600 font-mono text-[11px]">
                        <span>{g.played} matches</span>
                        <span className="text-emerald-700 font-bold">{g.won} wins</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
