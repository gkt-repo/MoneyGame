import React, { useEffect, useState, useRef } from 'react';
import { RoomItem, userApi, UserProfile } from '../services/api';
import { ArrowLeft, Users, Trophy, Award, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';

interface ActiveRoomViewProps {
  roomId: string;
  user: UserProfile;
  onBack: () => void;
  onRefreshBalance: () => void;
}

export const ActiveRoomView: React.FC<ActiveRoomViewProps> = ({
  roomId,
  user,
  onBack,
  onRefreshBalance,
}) => {
  const [room, setRoom] = useState<RoomItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(false);

  const fetchRoom = async () => {
    try {
      const data = await userApi.getRoomDetails(roomId);
      setRoom(data);
      if (['COMPLETED', 'CANCELLED'].includes(data.status) && !finished.current) {
        finished.current = true;
        if (data.winnerId === user.id) {
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 },
          });
        }
        onRefreshBalance();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    finished.current = false;
    fetchRoom();
    const interval = setInterval(() => { if (!finished.current) fetchRoom(); }, 2500);
    return () => clearInterval(interval);
  }, [roomId]);

  if (loading || !room) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
        <span className="text-xs">Connecting to table...</span>
      </div>
    );
  }

  const isFull = room.players.length >= room.maxPlayers;
  const isWinner = room.winnerId === user.id;
  const prizePool = room.entryFee * room.maxPlayers;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tables</span>
        </button>

        <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded">
          TABLE: {room.roomCode}
        </span>
      </div>

      {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
      {room.status === 'WAITING' && room.players.some(p => p.userId === user.id) && (
        <button className="text-sm text-red-600" onClick={async () => {
          try { await userApi.cancelRoom(roomId); await fetchRoom(); onRefreshBalance(); }
          catch (err) { setError(err instanceof Error ? err.message : 'Cancellation failed'); }
        }}>Cancel table and refund all entries</button>
      )}
      {/* Main Table Arena Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs text-center space-y-6">
        <div>
          <span
            className={`inline-block px-3 py-1 rounded text-xs font-semibold mb-2 ${
              room.status === 'COMPLETED'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : isFull
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {room.status === 'COMPLETED'
              ? 'Game Concluded'
              : room.status === 'CANCELLED' ? 'Cancelled — entry fees refunded'
              : isFull
              ? 'Evaluating Guesses...'
              : 'Waiting for Players'}
          </span>

          <h2 className="text-2xl font-bold text-slate-900 mono-num">
            Prize Pool: ₹{prizePool.toFixed(2)}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Stake per player: <span className="font-bold mono-num text-slate-800">₹{room.entryFee.toFixed(2)}</span>
          </p>
        </div>

        {/* Winner Announcement Banner */}
        {room.status === 'COMPLETED' && (
          <div
            className={`p-5 rounded-xl border text-center ${
              isWinner
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center mx-auto mb-2 text-emerald-600 shadow-xs">
              <Trophy className="w-6 h-6" />
            </div>

            <div className="text-lg font-bold">
              {isWinner ? '🎉 You Won the Table!' : `${room.winner?.username || 'Winner'} Won the Prize!`}
            </div>

            <div className="text-xs text-slate-600 mt-1">
              Winning Lucky Number: <strong className="font-mono text-base text-slate-900">#{room.winningNumber}</strong>
            </div>

            {isWinner && (
              <div className="mt-3 text-sm font-bold text-emerald-700 mono-num">
                {room.winnerPrize != null ? `₹${room.winnerPrize.toFixed(2)} credited to your wallet balance!` : 'Prize credited. See your wallet for the payout.'}
              </div>
            )}
          </div>
        )}

        {/* Players Seats */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 text-left">
            Table Seats ({room.players.length}/{room.maxPlayers})
          </div>

          <div className="grid grid-cols-2 gap-3">
            {room.players.map((p) => {
              const isMe = p.userId === user.id;
              const isPlayerWinner = room.winnerId === p.userId;

              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-xl border text-left transition ${
                    isPlayerWinner
                      ? 'bg-emerald-50 border-emerald-300'
                      : isMe
                      ? 'bg-slate-50 border-slate-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {p.user?.username || 'Player'}
                      {isMe && <span className="ml-1 text-[11px] text-emerald-600 font-normal">(You)</span>}
                    </span>
                    {isPlayerWinner && <Award className="w-4 h-4 text-emerald-600" />}
                  </div>

                  <div className="text-xs text-slate-500">
                    Chosen Guess:
                    <span className="mono-num font-bold text-base text-slate-900 ml-1.5">
                      #{p.guessNumber}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Empty Seat placeholder */}
            {!isFull && (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 text-xs py-6">
                <Users className="w-5 h-5 mb-1 text-slate-300" />
                <span>Waiting for opponent...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
