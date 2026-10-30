import React, { useState, useEffect } from 'react';
import type { UserProfileDTO } from '@moneygame/shared-types';
import { userApi } from '../services/api';
import { X, Check, Trophy, Flame, Calendar, Gamepad2, Shield, Edit2, Loader2 } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: (updated: UserProfileDTO) => void;
}

export const AVATAR_ICONS: Record<string, string> = {
  avatar_1: '🦁',
  avatar_2: '🐯',
  avatar_3: '🦅',
  avatar_4: '🐺',
  avatar_5: '🦊',
  avatar_6: '🐉',
  avatar_7: '🎯',
  avatar_8: '⚡',
  avatar_9: '👑',
  avatar_10: '🛡️',
  avatar_11: '💎',
  avatar_12: '🎲',
};

export const CURATED_AVATARS = Object.keys(AVATAR_ICONS);

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  onProfileUpdated,
}) => {
  const [profile, setProfile] = useState<UserProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('avatar_1');
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadProfile();
    }
  }, [isOpen]);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userApi.getUserProfile();
      setProfile(data);
      setDisplayName(data.displayName || data.username);
      setSelectedAvatar(data.avatar || 'avatar_1');
    } catch (err: any) {
      setError(err?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (newAvatar?: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await userApi.updateUserProfile({
        displayName: displayName.trim(),
        avatar: newAvatar || selectedAvatar,
      });
      setProfile(updated);
      setSelectedAvatar(updated.avatar);
      setIsEditingName(false);
      setSuccess('Profile updated successfully!');
      if (onProfileUpdated) onProfileUpdated(updated);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-800">Player Profile</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
              <span className="text-xs">Loading profile...</span>
            </div>
          ) : error && !profile ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm text-center">
              {error}
            </div>
          ) : profile ? (
            <>
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg">{error}</div>
              )}
              {success && (
                <div className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-lg flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  <span>{success}</span>
                </div>
              )}

              {/* Avatar & Display Name Section */}
              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200">
                <div className="relative group">
                  <div className="w-20 h-20 rounded-2xl bg-white shadow-md border-2 border-emerald-500/30 flex items-center justify-center text-4xl">
                    {AVATAR_ICONS[selectedAvatar] || '🦁'}
                  </div>
                </div>

                <div className="flex-1 text-center sm:text-left space-y-1">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    {isEditingName ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          maxLength={30}
                          className="px-2.5 py-1 text-sm font-bold bg-white border border-emerald-500 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30"
                          placeholder="Display name"
                        />
                        <button
                          onClick={() => handleSave()}
                          disabled={saving}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setDisplayName(profile.displayName || profile.username);
                            setIsEditingName(false);
                          }}
                          className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-lg font-bold text-slate-900">{profile.displayName}</h3>
                        <button
                          onClick={() => setIsEditingName(true)}
                          className="p-1 text-slate-400 hover:text-emerald-600 transition cursor-pointer"
                          title="Edit display name"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                  <p className="text-xs font-mono text-slate-500">@{profile.username}</p>
                  <div className="flex items-center justify-center sm:justify-start gap-1 text-[11px] text-slate-400">
                    <Calendar className="w-3 h-3" />
                    <span>Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              {/* Curated Avatar Grid Picker */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Select Avatar
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {CURATED_AVATARS.map((av) => {
                    const isSelected = selectedAvatar === av;
                    return (
                      <button
                        key={av}
                        type="button"
                        onClick={() => {
                          setSelectedAvatar(av);
                          handleSave(av);
                        }}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-50 border-2 border-emerald-600 shadow-sm scale-105'
                            : 'bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        {AVATAR_ICONS[av]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stats Overview Grid */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Career Statistics
                </label>
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
              </div>

              {/* Per-Game Breakdown */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Game Breakdown
                </label>
                <div className="space-y-1.5 text-xs">
                  {Object.keys(profile.stats.byGame).length === 0 ? (
                    <p className="text-slate-400 italic text-xs py-2">No completed games recorded yet.</p>
                  ) : (
                    Object.entries(profile.stats.byGame).map(([game, g]) => (
                      <div
                        key={game}
                        className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200/60"
                      >
                        <span className="font-semibold text-slate-800">
                          {game === 'SEEP' ? '♠ Seep' : game === 'TWENTY_NINE'
                            ? '29 Card Game'
                            : game === 'TEEN_PATTI'
                            ? 'Teen Patti'
                            : game === 'SPORTS_MATCH'
                            ? 'Sports Match'
                            : 'Guess Number'}
                        </span>
                        <div className="flex items-center gap-4 text-slate-600 font-mono text-[11px]">
                          <span>{g.played} played</span>
                          <span className="text-emerald-700 font-bold">{g.won} won</span>
                          <span className="text-amber-700">{g.winRatePercent}% rate</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Match History */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Recent Games
                </label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {profile.recentGames.length === 0 ? (
                    <p className="text-slate-400 italic text-xs py-2">No recent matches.</p>
                  ) : (
                    profile.recentGames.map((m) => (
                      <div
                        key={m.roomId}
                        className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-slate-800">
                            {m.gameType === 'SEEP' ? '♠ Seep' : m.gameType === 'TWENTY_NINE'
                              ? '29 Card Game'
                              : m.gameType === 'TEEN_PATTI'
                              ? 'Teen Patti'
                              : m.gameType === 'SPORTS_MATCH'
                              ? 'Sports Match'
                              : 'Guess Number'}
                          </span>
                          <span className="ml-2 font-mono text-[10px] text-slate-400">
                            #{m.roomCode}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-slate-500">₹{m.entryFee}</span>
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              m.isWin
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {m.isWin ? `WON +₹${m.prize}` : 'LOST'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
