import React, { useState, useEffect } from 'react';
import { RoomItem, UserProfile, userApi } from '../../../services/api';
import { connectSocket } from '../../../services/socket';
import {
  Trophy,
  Copy,
  Check,
  RotateCcw,
  Clock,
  Sparkles,
  Users,
  AlertCircle,
  XCircle,
  Dices,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Dice3D } from './Dice3D';

interface GuessNumberTableViewProps {
  room: RoomItem;
  user: UserProfile;
  onRefreshBalance?: () => void;
  onBack?: () => void;
}

export const GuessNumberTableView: React.FC<GuessNumberTableViewProps> = ({
  room: initialRoom,
  user,
  onRefreshBalance,
  onBack,
}) => {
  const [room, setRoom] = useState<RoomItem>(initialRoom);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [rollTickNumber, setRollTickNumber] = useState<number | null>(null);
  const [rollIndex, setRollIndex] = useState(1);
  const [currentRollNumber, setCurrentRollNumber] = useState<number | null>(null);
  const [isRolling3D, setIsRolling3D] = useState(false);
  const [isCurrentMatch, setIsCurrentMatch] = useState(false);
  const [rollsHistory, setRollsHistory] = useState<
    Array<{
      rollIndex: number;
      number: number;
      isMatch: boolean;
      winnerUsername?: string;
    }>
  >([]);
  const [copiedCode, setCopiedCode] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    setRoom(initialRoom);
  }, [initialRoom]);

  // Connect to room channel for real-time multiplayer roll animations
  useEffect(() => {
    const socket = connectSocket();

    const onConnect = () => {
      socket.emit('join_room_channel', room.id);
      userApi.getRoomDetails(room.id).then(freshRoom => {
        if (freshRoom) {
          setRoom(freshRoom);
          if (['COMPLETED', 'CANCELLED'].includes(freshRoom.status)) {
            setIsRolling(false);
            setIsRolling3D(false);
            setCountdown(null);
          }
        }
      }).catch(() => {});
    };

    socket.on('connect', onConnect);
    socket.emit('join_room_channel', room.id);

    const onRoomUpdated = (data: RoomItem) => {
      if (data && data.id === room.id) {
        setRoom(data);
        if (['COMPLETED', 'CANCELLED'].includes(data.status)) {
          setIsRolling(false);
          setIsRolling3D(false);
          setCountdown(null);
        }
      }
    };

    const onCountdown = (data: { countdown: number; roomId?: string }) => {
      if (data && (!data.roomId || data.roomId === room.id) && typeof data.countdown === 'number') {
        setCountdown(data.countdown);
      }
    };

    const onRollStarted = (data?: { roomId?: string }) => {
      if (!data || !data.roomId || data.roomId === room.id) {
        setIsRolling(true);
        setIsRolling3D(true);
        setCountdown(null);
      }
    };

    const onRollAttemptStart = (data: { roomId?: string; rollIndex: number }) => {
      if (!data || !data.roomId || data.roomId === room.id) {
        setRollIndex(data.rollIndex);
        setIsRolling(true);
        setIsRolling3D(true);
        setIsCurrentMatch(false);
        setCountdown(null);
      }
    };

    const onRollTick = (data: { number: number; roomId?: string }) => {
      if (data && (!data.roomId || data.roomId === room.id) && typeof data.number === 'number') {
        setRollTickNumber(data.number);
      }
    };

    const onRollOutcome = (data: {
      roomId?: string;
      rollIndex: number;
      number: number;
      isMatch: boolean;
      winnerId?: string | null;
      winnerUsername?: string | null;
      rollsHistory?: Array<any>;
    }) => {
      if (!data || !data.roomId || data.roomId === room.id) {
        setRollIndex(data.rollIndex);
        setCurrentRollNumber(data.number);
        setIsRolling3D(false);
        setIsCurrentMatch(data.isMatch);
        if (data.rollsHistory) {
          setRollsHistory(data.rollsHistory);
        }
      }
    };

    const onGameFinished = (data: any) => {
      if (data?.room && data.room.id !== room.id) return;
      setIsRolling(false);
      setIsRolling3D(false);
      setCountdown(null);
      if (data?.winningNumber) {
        setCurrentRollNumber(data.winningNumber);
        setIsCurrentMatch(true);
      }
      if (data?.room) {
        setRoom(data.room);
      }
      if (data?.winnerId === user.id) {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
        });
      }
      if (onRefreshBalance) onRefreshBalance();
    };

    socket.on('room_updated', onRoomUpdated);
    socket.on('game_countdown', onCountdown);
    socket.on('roll_started', onRollStarted);
    socket.on('roll_attempt_start', onRollAttemptStart as any);
    socket.on('roll_tick', onRollTick);
    socket.on('roll_outcome', onRollOutcome as any);
    socket.on('game_finished', onGameFinished);

    return () => {
      socket.emit('leave_room_channel', room.id);
      socket.off('connect', onConnect);
      socket.off('room_updated', onRoomUpdated);
      socket.off('game_countdown', onCountdown);
      socket.off('roll_started', onRollStarted);
      socket.off('roll_attempt_start', onRollAttemptStart as any);
      socket.off('roll_tick', onRollTick);
      socket.off('roll_outcome', onRollOutcome as any);
      socket.off('game_finished', onGameFinished);
    };
  }, [room.id, user.id, onRefreshBalance]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCancelTable = async () => {
    if (!window.confirm('Cancel this table and refund all entry fees to players?')) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await userApi.cancelRoom(room.id);
      if (onRefreshBalance) onRefreshBalance();
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel table');
    } finally {
      setCancelling(false);
    }
  };

  const isFull = room.players.length >= room.maxPlayers;
  const isWinner = room.winnerId === user.id;
  const isCompleted = room.status === 'COMPLETED';
  const isCancelled = room.status === 'CANCELLED';
  const totalPot = room.entryFee * room.maxPlayers;
  const winnerPrize = room.winnerPrize ?? totalPot * 0.90;
  const isMeInRoom = room.players.some((p) => p.userId === user.id);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
      {/* ─── TOP METRICS BAR ─── */}
      <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <div>
          <span className="text-[11px] font-semibold text-slate-500 block">ENTRY STAKE</span>
          <span className="text-lg font-bold mono-num text-slate-900">
            ₹{room.entryFee.toFixed(0)}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-semibold text-emerald-700 block">WINNER PAYOUT</span>
          <span className="text-lg font-bold mono-num text-emerald-600">
            ₹{winnerPrize.toFixed(0)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[11px] font-semibold text-slate-500 block">OCCUPANCY</span>
          <span className="text-xs font-bold mono-num px-2 py-0.5 rounded bg-slate-200/80 text-slate-800 inline-block mt-0.5">
            {room.players.length} / {room.maxPlayers} Seats
          </span>
        </div>
      </div>

      {cancelError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{cancelError}</span>
        </div>
      )}

      {/* ─── LIVE GAME STATE BANNER ─── */}
      {isCompleted ? (
        /* 1. Finished Game State */
        <div
          className={`p-6 sm:p-8 rounded-3xl border text-center space-y-4 shadow-md transition-all ${
            isWinner
              ? 'bg-gradient-to-b from-emerald-950 via-slate-900 to-slate-950 border-emerald-500/50 text-white'
              : 'bg-gradient-to-b from-slate-900 to-slate-950 border-slate-800 text-white'
          }`}
        >
          <div className="inline-block px-4 py-1.5 rounded-full text-xs font-black tracking-wider uppercase bg-amber-500/20 border border-amber-400/40 text-amber-300">
            {isWinner ? '🎉 YOU ARE THE WINNER!' : '🏆 TABLE CONCLUDED'}
          </div>

          {/* 3D Dice settled on winning number */}
          <Dice3D
            isRolling={false}
            targetNumber={room.winningNumber ?? currentRollNumber ?? 7}
            rollIndex={rollsHistory.length || 1}
            isMatch={true}
          />

          <div>
            <div className="text-lg font-extrabold text-white">
              Winner: {room.winner?.username || 'Winner'}
            </div>
            <div className="text-sm font-bold text-emerald-400 mono-num mt-1">
              Payout: ₹{winnerPrize.toFixed(2)} credited to wallet
            </div>
          </div>

          {/* Sequence of rolls until match occurred */}
          {rollsHistory.length > 0 && (
            <div className="pt-3 border-t border-slate-800">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Rolls Sequence ({rollsHistory.length} Roll{rollsHistory.length > 1 ? 's' : ''}):
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {rollsHistory.map((hist, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-xl text-xs font-bold font-mono border ${
                      hist.isMatch
                        ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300 shadow-sm'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Roll #{hist.rollIndex}: <strong className="text-white">#{hist.number}</strong> {hist.isMatch ? '✓ MATCH!' : '✖'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {onBack && (
            <div className="pt-3">
              <button
                onClick={onBack}
                className="w-full sm:w-auto px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md"
              >
                Back to Lobby
              </button>
            </div>
          )}
        </div>
      ) : isCancelled ? (
        /* 2. Cancelled State */
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-2">
          <XCircle className="w-8 h-8 text-red-500 mx-auto" />
          <h3 className="text-sm font-bold text-red-900">Table Cancelled</h3>
          <p className="text-xs text-red-700">All player entry stakes have been refunded to wallet.</p>
        </div>
      ) : isRolling ? (
        /* 3. Rolling Random Winner State with 3D 10-Digit Dice */
        <div className="p-6 sm:p-8 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl text-center space-y-5 shadow-xl text-white">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5 text-left">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-sm shadow-xs">
                🎲
              </div>
              <div>
                <h3 className="text-xs font-black tracking-wide uppercase text-white">
                  3D 10-Digit Dice
                </h3>
                <p className="text-[11px] text-slate-400">
                  Rolling 1 time, 2 times... until a picked number hits!
                </p>
              </div>
            </div>

            <div className="px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-black tracking-wider animate-pulse">
              ROLL ATTEMPT #{rollIndex}
            </div>
          </div>

          {/* 3D 10-Digit Dice Component */}
          <Dice3D
            isRolling={isRolling3D}
            targetNumber={currentRollNumber ?? rollTickNumber ?? 7}
            rollIndex={rollIndex}
            isMatch={isCurrentMatch}
          />

          {/* Suspense status text */}
          <div className="py-2.5 px-5 rounded-2xl bg-slate-950/70 border border-slate-800 inline-block">
            {isRolling3D ? (
              <span className="text-xs font-bold text-emerald-400 animate-pulse flex items-center gap-2 justify-center">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                Rolling 3D Dice (Roll #{rollIndex})...
              </span>
            ) : isCurrentMatch ? (
              <span className="text-xs font-black text-amber-400 flex items-center gap-2 justify-center">
                <Sparkles className="w-4 h-4 text-amber-300" />
                Roll #{rollIndex} landed on #{currentRollNumber} — MATCH! WINNER FOUND!
              </span>
            ) : currentRollNumber !== null ? (
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 justify-center">
                <span className="text-red-400 font-bold">✖ No Match</span> on #{currentRollNumber}! Re-rolling for Roll #{rollIndex + 1}...
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                Rolling 3D 10-digit dice with verified cryptographic randomness
              </span>
            )}
          </div>

          {/* Sequence of previous rolls */}
          {rollsHistory.length > 0 && (
            <div className="pt-3 border-t border-slate-800">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Rolls History:
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {rollsHistory.map((hist, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-xl text-xs font-bold font-mono border ${
                      hist.isMatch
                        ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 shadow-sm'
                        : 'bg-slate-800/90 border-slate-700 text-slate-300'
                    }`}
                  >
                    Roll #{hist.rollIndex}: <strong className="text-white">#{hist.number}</strong> {hist.isMatch ? '✓ MATCH!' : '✖'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : countdown !== null ? (
        /* 4. Table Full Countdown State */
        <div className="p-8 bg-amber-50/70 border border-amber-300 rounded-2xl text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
            Table Full — Starting In
          </div>
          <div className="text-5xl font-extrabold font-mono text-amber-600 animate-bounce">
            {countdown}
          </div>
          <p className="text-xs text-slate-500">Prepare for the number reveal!</p>
        </div>
      ) : (
        /* 5. Waiting for Players */
        <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-slate-200/80 flex items-center justify-center mx-auto text-slate-500">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            Waiting for {room.maxPlayers - room.players.length} more player
            {room.maxPlayers - room.players.length > 1 ? 's' : ''}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            The roll will begin automatically once all seats are filled. Share the table code with friends to start immediately!
          </p>
        </div>
      )}

      {/* ─── TABLE PARTICIPANTS (Secret Guess Number Masking!) ─── */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Table Participants
        </h4>

        <div className="space-y-2.5">
          {Array.from({ length: room.maxPlayers }).map((_, index) => {
            const p = room.players[index];
            if (p) {
              const isMe = p.userId === user.id;
              const isPlayerWinner = room.winnerId === p.userId;
              // Mask opponent guess until game completed (Matching Flutter app privacy protection!)
              const showSecret = isMe || isCompleted;

              return (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between transition ${
                    isPlayerWinner
                      ? 'bg-emerald-50 border-emerald-300'
                      : isMe
                      ? 'bg-emerald-50/40 border-emerald-500/40'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white ${
                        isMe ? 'bg-emerald-600' : 'bg-slate-800'
                      }`}
                    >
                      {p.user?.username ? p.user.username[0].toUpperCase() : 'P'}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-900">
                          {p.user?.username || 'Player'}
                        </span>
                        {isMe && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                            YOU
                          </span>
                        )}
                        {isPlayerWinner && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                            WINNER
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {index === 0 ? 'Table Host' : 'Challenger'}
                      </span>
                    </div>
                  </div>

                  {/* Secret Number Badge */}
                  <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-800">
                    {showSecret ? `No. ${p.guessNumber}` : 'No. ? [🔒]'}
                  </div>
                </div>
              );
            }

            // Empty seat placeholder
            return (
              <div
                key={`empty-${index}`}
                className="p-3.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-400"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                    <Users className="w-4 h-4" />
                  </div>
                  <span>Empty Seat</span>
                </div>
                <span>Waiting...</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── ROOM CODE SHARE PILL & HOST ACTIONS ─── */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl w-full sm:w-auto">
          <span className="text-slate-500 font-medium">Table Code:</span>
          <span className="font-mono font-bold text-slate-900 tracking-wider">
            {room.roomCode}
          </span>
          <button
            onClick={handleCopyCode}
            className="p-1 hover:text-emerald-600 transition ml-1"
            title="Copy Code"
          >
            {copiedCode ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        </div>

        {room.status === 'WAITING' && isMeInRoom && (
          <button
            onClick={handleCancelTable}
            disabled={cancelling}
            className="text-xs text-red-600 hover:text-red-700 font-semibold hover:underline"
          >
            {cancelling ? 'Cancelling...' : 'Cancel table and refund all entries'}
          </button>
        )}
      </div>
    </div>
  );
};
