import React, { useState, useEffect } from 'react';
import { RoomPreviewDTO } from '@moneygame/shared-types';
import { userApi, UserProfile } from '../services/api';
import { AVATAR_ICONS } from './ProfileModal';
import { X, Users, AlertCircle, ArrowRight, Loader2, Lock, ShieldCheck } from 'lucide-react';

interface InvitationPreviewModalProps {
  token: string | null;
  currentUser: UserProfile | null;
  onClose: () => void;
  onRequireAuth: () => void;
  onJoined: (roomId: string, gameType: string) => void;
}

export const InvitationPreviewModal: React.FC<InvitationPreviewModalProps> = ({
  token,
  currentUser,
  onClose,
  onRequireAuth,
  onJoined,
}) => {
  const [preview, setPreview] = useState<RoomPreviewDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGuessNumber, setSelectedGuessNumber] = useState<number>(1);
  const [selectedTeam, setSelectedTeam] = useState<number>(1);

  useEffect(() => {
    if (token) {
      loadPreview(token);
    } else {
      setPreview(null);
    }
  }, [token]);

  const loadPreview = async (invToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await userApi.getInvitationPreview(invToken);
      setPreview(data);
      setSelectedGuessNumber(Array.from({length: 10}, (_, i) => i + 1).find(n => !data.takenNumbers?.includes(n)) || 1);
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired invitation link');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!token || !preview) return;
    if (!currentUser) {
      sessionStorage.setItem('pending_invitation_token', token);
      onRequireAuth();
      return;
    }

    setJoining(true);
    setError(null);
    try {
      const pick =
        preview.gameType === 'SPORTS_MATCH'
          ? selectedTeam
          : preview.gameType === 'GUESS_NUMBER'
          ? selectedGuessNumber
          : null;
      const res = await userApi.joinByInvitation(token, undefined, pick);
      if (res?.room?.id) {
        sessionStorage.removeItem('pending_invitation_token');
        onJoined(res.room.id, res.room.gameType);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to join table');
    } finally {
      setJoining(false);
    }
  };

  if (!token) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-800">Table Invitation</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <div className="text-sm space-y-1">
            <a className="text-emerald-700 underline font-semibold" href={`moneygame://join/${encodeURIComponent(token)}`}>Open installed app</a>
            <p className="text-xs text-slate-500">Or continue here in your browser. Joining requires confirmation.</p>
          </div>
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
              <span className="text-xs">Resolving table details...</span>
            </div>
          ) : error && !preview ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to Load Table</p>
                <p className="text-xs mt-1 text-red-500">{error}</p>
              </div>
            </div>
          ) : preview ? (
            <>
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Host Badge */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <div className="w-12 h-12 rounded-xl bg-white shadow-2xs border border-slate-200 flex items-center justify-center text-2xl">
                  {AVATAR_ICONS[preview.host.avatar] || '🦁'}
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Invited by
                  </div>
                  <div className="text-sm font-bold text-slate-800">
                    {preview.host.displayName}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    @{preview.host.username}
                  </div>
                </div>
              </div>

              {/* Game Table Summary */}
              <div className="p-4 bg-gradient-to-br from-emerald-50/50 to-emerald-100/30 rounded-xl border border-emerald-200/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">
                    {preview.gameType === 'TWENTY_NINE'
                      ? '29 Card Game'
                      : preview.gameType === 'TEEN_PATTI'
                      ? 'Teen Patti'
                      : preview.gameType === 'SPORTS_MATCH'
                      ? 'Sports Match'
                      : 'Guess Number'}
                  </span>
                  <span className="px-2 py-0.5 bg-white text-emerald-800 text-xs font-mono font-bold rounded border border-emerald-200">
                    #{preview.roomCode}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-emerald-200/40 text-xs">
                  <div>
                    <span className="text-slate-500">Entry Stake</span>
                    <p className="text-base font-bold font-mono text-slate-900 mt-0.5">
                      ₹{preview.entryFee.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Seats</span>
                    <p className="text-base font-bold font-mono text-slate-900 mt-0.5 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{preview.occupiedSeats}/{preview.maxPlayers}</span>
                    </p>
                  </div>
                </div>
              </div>

              {preview.rulesSummary && <div className="text-xs text-slate-600"><p>{preview.rulesVersion}: {preview.rulesSummary}</p><a href="/rules/29.html" target="_blank" rel="noreferrer" className="underline">Read the full house rules</a></div>}
              {/* Status explanation */}
              {!preview.available ? (
                <div className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    {preview.unavailabilityReason === 'FULL'
                      ? 'This table has already reached its maximum players limit.'
                      : preview.unavailabilityReason === 'STARTED'
                      ? 'This game is already underway and cannot be joined.'
                      : preview.unavailabilityReason === 'CANCELLED'
                      ? 'This table has been cancelled.'
                      : preview.unavailabilityReason === 'EXPIRED' ? 'This invitation has expired or been revoked. Ask the host for a new code.' : 'This table is no longer available to join.'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Table is open. Seat will be confirmed upon joining.</span>
                </div>
              )}

              {/* Selection for Dice Guess */}
              {preview.gameType === 'GUESS_NUMBER' && preview.available && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Choose Lucky Number (1–10):</label>
                  <div className="grid grid-cols-6 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        disabled={preview.takenNumbers?.includes(num)}
                        onClick={() => setSelectedGuessNumber(num)}
                        className={`py-2 text-sm font-bold rounded-lg border transition cursor-pointer ${
                          selectedGuessNumber === num
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selection for Sports Match */}
              {preview.gameType === 'SPORTS_MATCH' && preview.available && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Select Backing Team:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 2].map((teamNum) => (
                      <button
                        key={teamNum}
                        type="button"
                        onClick={() => setSelectedTeam(teamNum)}
                        className={`py-2.5 px-3 text-xs font-bold rounded-lg border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          selectedTeam === teamNum
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span>🏏 {preview.teams?.[teamNum - 1] || `Team ${teamNum}`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Button */}
              {currentUser ? (
                <button
                  onClick={handleJoin}
                  disabled={!preview.available || joining}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-md transition cursor-pointer ${
                    preview.available
                      ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-98'
                      : 'bg-slate-300 cursor-not-allowed text-slate-500 shadow-none'
                  }`}
                >
                  {joining ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Joining Table...</span>
                    </>
                  ) : (
                    <>
                      <span>Join Table · Pay ₹{preview.entryFee.toFixed(2)}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (token) sessionStorage.setItem('pending_invitation_token', token);
                    onRequireAuth();
                  }}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:scale-98 flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                >
                  <span>Log in or Register to Join</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
