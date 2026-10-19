import React, { useState, useEffect } from 'react';
import { RoomItem, userApi, UserProfile } from '../../../services/api';
import { connectSocket } from '../../../services/socket';
import { PlayingCard, TeenPattiGameState, TeenPattiPlayerState } from '@moneygame/shared-types';
import { Trophy, Eye, Clock, Coins, ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';

interface TeenPattiTableViewProps {
  room: RoomItem;
  user: UserProfile;
  onRefreshBalance: () => void;
  onBack?: () => void;
}

export const TeenPattiTableView: React.FC<TeenPattiTableViewProps> = ({
  room,
  user,
  onRefreshBalance,
  onBack,
}) => {
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [localGameState, setLocalGameState] = useState<TeenPattiGameState | null>(room.gameState || null);
  const [finishData, setFinishData] = useState<{
    winnerId: string;
    winnerUsername: string;
    prizePool: number;
    winnerPrize?: number;
    reason?: string;
    showdown?: Array<{
      userId: string;
      username: string;
      cards: PlayingCard[];
      handResult?: any;
    }>;
  } | null>(null);

  // Sync initial game state from props if changed
  useEffect(() => {
    if (room.gameState) {
      setLocalGameState(room.gameState);
    }
  }, [room.gameState]);

  // Connect to live WebSockets for instant table interactions
  useEffect(() => {
    const socket = connectSocket();
    socket.emit('join_room_channel', room.id);

    socket.on('teen_patti_state', (state: TeenPattiGameState) => {
      if (state) {
        setLocalGameState(state);
      }
    });

    socket.on('turn_timer_started', (data: { currentTurnUserId: string; turnExpiresAt: number }) => {
      setLocalGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          currentTurnUserId: data.currentTurnUserId,
          turnExpiresAt: data.turnExpiresAt,
        };
      });
    });

    socket.on('player_acted', (data: { userId: string; action: string; betAmount: number; pot: number }) => {
      setLocalGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          pot: data.pot,
        };
      });
    });

    socket.on('cards_revealed', (data: { cards: PlayingCard[]; hand: any }) => {
      setLocalGameState(prev => {
        if (!prev) return prev;
        const myP = prev.players[user.id];
        if (!myP) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            [user.id]: {
              ...myP,
              isSeen: true,
              cards: data.cards,
            },
          },
        };
      });
    });

    socket.on('game_finished', (data: any) => {
      setFinishData(data);
      if (data.winnerId === user.id) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
      onRefreshBalance();
    });

    return () => {
      socket.emit('leave_room_channel', room.id);
      socket.disconnect();
    };
  }, [room.id, user.id, onRefreshBalance]);

  const gameState = localGameState;
  const isCompleted = room.status === 'COMPLETED' || finishData !== null;
  const isPlaying = room.status === 'PLAYING' && !isCompleted;

  // Find user's player state
  const myPlayerState: TeenPattiPlayerState | undefined = gameState?.players?.[user.id];
  const isMyTurn = gameState?.currentTurnUserId === user.id && isPlaying && !myPlayerState?.isPacked;

  // Turn timer calculation
  const [timeLeft, setTimeLeft] = useState<number>(25);
  useEffect(() => {
    if (!gameState?.turnExpiresAt || !isPlaying) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((gameState.turnExpiresAt! - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 500);
    return () => clearInterval(interval);
  }, [gameState?.turnExpiresAt, isPlaying]);

  // Send action to server
  const handleAction = async (action: string, payload: any = {}) => {
    if (isCompleted) {
      setActionError('This hand has already concluded');
      return;
    }

    setSubmittingAction(true);
    setActionError(null);
    try {
      const res = await userApi.sendGameAction(room.id, action, payload);
      if (!res.success) {
        setActionError(res.message || 'Action failed');
      } else {
        if (res.gameState) {
          setLocalGameState(res.gameState);
        }
        if (action === 'SHOW' || action === 'PACK') {
          onRefreshBalance();
        }
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to submit action');
    } finally {
      setSubmittingAction(false);
    }
  };

  const activePlayers = gameState ? Object.values(gameState.players).filter(p => !p.isPacked) : [];
  const canShow = activePlayers.length === 2 && isMyTurn && !isCompleted;
  const winnerUserId = finishData?.winnerId || room.winnerId;
  const isWinner = winnerUserId === user.id;

  const currentChaalCost = myPlayerState?.isSeen
    ? (gameState?.currentChaalAmount || room.entryFee) * 2
    : (gameState?.currentChaalAmount || room.entryFee);

  return (
    <div className="space-y-4">
      {/* ─── POKER FELT TABLE ARENA ─── */}
      <div className="relative bg-emerald-950 border-4 border-amber-900/60 rounded-3xl p-6 sm:p-10 shadow-2xl overflow-hidden min-h-[480px] flex flex-col justify-between">
        {/* Felt Texture & Ring */}
        <div className="absolute inset-4 rounded-2xl border-2 border-emerald-500/20 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-800/40 via-emerald-950/80 to-slate-950 pointer-events-none" />

        {/* Top Bar: Table Info & Turn Notification */}
        <div className="relative z-10 flex items-center justify-between text-xs text-emerald-200/80 border-b border-emerald-800/50 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-wider uppercase text-amber-400 flex items-center gap-1">
              <span>🃏</span> Teen Patti
            </span>
            <span className="px-2 py-0.5 bg-emerald-900/80 border border-emerald-700/50 rounded font-mono text-[11px]">
              Boot: ₹{room.entryFee.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isPlaying && (
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition ${
                isMyTurn
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-md animate-pulse'
                  : 'bg-emerald-900/70 text-emerald-300'
              }`}>
                <Clock className="w-3.5 h-3.5" />
                {isMyTurn
                  ? `Your Turn (${timeLeft}s)`
                  : myPlayerState?.isPacked
                  ? 'You Folded (Waiting for hand to finish...)'
                  : 'Opponent Thinking...'}
              </span>
            )}
            {isCompleted && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Hand Concluded
              </span>
            )}
          </div>
        </div>

        {/* Center Table Area: Pot & Chips OR Final Winner Banner */}
        <div className="relative z-10 my-auto text-center py-4">
          {!isCompleted ? (
            <div className="inline-flex flex-col items-center bg-emerald-900/70 border border-amber-500/30 rounded-2xl px-6 py-3 shadow-lg backdrop-blur-xs">
              <div className="flex items-center gap-2 text-amber-400">
                <Coins className="w-5 h-5 animate-bounce" />
                <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-200">Total Pot</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-amber-300 mt-0.5">
                ₹{(gameState?.pot || room.entryFee * room.players.length).toFixed(2)}
              </div>
              {gameState && (
                <div className="text-[11px] text-emerald-300/80 mt-1 flex gap-3">
                  <span>Chaal: <strong className="text-white">₹{(gameState.currentChaalAmount * 2).toFixed(2)}</strong></span>
                  <span>Blind: <strong className="text-white">₹{gameState.currentChaalAmount.toFixed(2)}</strong></span>
                </div>
              )}
            </div>
          ) : (
            /* Concluded Game Celebration Card */
            <div className="bg-amber-950/80 border-2 border-amber-400/60 rounded-2xl p-5 max-w-md mx-auto text-amber-100 shadow-2xl backdrop-blur-md animate-fade-in space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center mx-auto text-amber-300">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-amber-300">
                  {isWinner ? '🎉 You Won the Table!' : `🏆 ${finishData?.winnerUsername || room.winner?.username || 'Winner'} Won!`}
                </h3>
                <div className="text-xs text-amber-200/90 mt-0.5">
                  {finishData?.reason || (isWinner ? 'Prize credited to your wallet' : 'Hand completed')}
                </div>
              </div>

              <div className="text-2xl font-mono font-black text-emerald-400">
                +₹{((finishData?.winnerPrize ?? room.winnerPrize) || (gameState?.pot || room.entryFee * room.players.length) * 0.9).toFixed(2)}
              </div>

              {/* Showdown Hands if available */}
              {finishData?.showdown && finishData.showdown.length > 0 && (
                <div className="pt-2 border-t border-amber-400/20 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">Showdown Reveal</div>
                  <div className="flex flex-wrap justify-center gap-4">
                    {finishData.showdown.map(s => (
                      <div key={s.userId} className="flex flex-col items-center">
                        <span className="text-[10px] text-amber-200 font-semibold mb-1">
                          {s.username} {s.userId === user.id ? '(You)' : ''}
                        </span>
                        <div className="flex -space-x-2">
                          {s.cards.map((c, i) => (
                            <CardVisual key={i} card={c} />
                          ))}
                        </div>
                        {s.handResult && (
                          <span className="text-[9px] font-bold text-amber-400 mt-1 uppercase">
                            {s.handResult.name || s.handResult.type}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {onBack && (
                <div className="pt-2">
                  <button
                    onClick={onBack}
                    className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Lobby</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Circular Player Seats Around the Table */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 gap-3 my-2">
          {room.players.map((p) => {
            const isMe = p.userId === user.id;
            const pState = gameState?.players?.[p.userId];
            const isPacked = !!pState?.isPacked;
            const isTurn = gameState?.currentTurnUserId === p.userId && isPlaying && !isPacked;
            const isSeen = pState?.isSeen;

            return (
              <div
                key={p.id}
                className={`p-2.5 rounded-xl border transition-all duration-300 ${
                  isPacked
                    ? 'bg-slate-900/60 border-slate-700/50 opacity-40'
                    : isTurn
                    ? 'bg-amber-400/20 border-amber-400 ring-2 ring-amber-400/50 scale-[1.02]'
                    : isMe
                    ? 'bg-emerald-900/50 border-emerald-500/60'
                    : 'bg-emerald-950/60 border-emerald-800/60'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white truncate max-w-[90px]">
                    {p.user?.username || 'Player'}
                    {isMe && <span className="text-amber-400 ml-1 text-[10px]">(You)</span>}
                  </span>
                  {/* Status Badge */}
                  {isPacked ? (
                    <span className="text-[10px] font-bold text-red-400 uppercase">Packed</span>
                  ) : isSeen ? (
                    <span className="text-[10px] font-bold text-cyan-300 uppercase">Seen</span>
                  ) : (
                    <span className="text-[10px] font-bold text-purple-300 uppercase">Blind</span>
                  )}
                </div>

                <div className="mt-1 flex items-center justify-between text-[11px] text-emerald-300/80">
                  <span>Bet: ₹{(pState?.totalBet || room.entryFee).toFixed(2)}</span>
                  {isTurn && !isPacked && (
                    <span className="text-amber-400 font-mono font-bold animate-pulse text-[10px]">
                      Thinking...
                    </span>
                  )}
                </div>

                {/* Show cards if revealed (e.g. at showdown or after seeing) */}
                {pState?.cards && pState.cards.length > 0 && (!isMe || isCompleted) && (
                  <div className="mt-2 flex -space-x-2 justify-center">
                    {pState.cards.map((c, i) => (
                      <CardVisual key={i} card={c} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Drawer: My Hand & Turn Action Controls */}
        <div className="relative z-10 pt-4 border-t border-emerald-800/60 mt-3">
          {actionError && (
            <p className="text-red-300 text-xs mb-2 text-center bg-red-950/80 py-1.5 px-3 rounded-lg border border-red-700 shadow-xs">
              {actionError}
            </p>
          )}

          {myPlayerState && !myPlayerState.isPacked && isPlaying && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* My 3 Cards Display */}
              <div className="flex items-center gap-2">
                {myPlayerState.isSeen && myPlayerState.cards ? (
                  // Cards Revealed
                  <div className="flex items-center gap-1.5">
                    {myPlayerState.cards.map((c, idx) => (
                      <CardVisual key={idx} card={c} />
                    ))}
                  </div>
                ) : (
                  // Face Down Cards with "See Cards" Button
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-3">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-10 h-14 bg-blue-900 border-2 border-white rounded-md shadow-md flex items-center justify-center transform -rotate-3 transition hover:rotate-0"
                        >
                          <div className="w-7 h-10 border border-blue-700 rounded bg-blue-950 flex items-center justify-center text-blue-400 text-[10px] font-bold">
                            ♠
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleAction('SEE_CARDS')}
                      disabled={submittingAction}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>See Cards</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons (Turn Controls) */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {/* Pack / Fold */}
                <button
                  disabled={!isMyTurn || submittingAction}
                  onClick={() => handleAction('PACK')}
                  className="flex-1 sm:flex-none px-3.5 py-2 bg-red-900/60 hover:bg-red-800 text-red-200 border border-red-700/60 rounded-xl text-xs font-bold transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Pack (Fold)
                </button>

                {/* Blind or Chaal */}
                {!myPlayerState.isSeen ? (
                  <button
                    disabled={!isMyTurn || submittingAction}
                    onClick={() => handleAction('BLIND')}
                    className="flex-1 sm:flex-none px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                  >
                    Blind (₹{(gameState?.currentChaalAmount || room.entryFee).toFixed(2)})
                  </button>
                ) : (
                  <button
                    disabled={!isMyTurn || submittingAction}
                    onClick={() => handleAction('CHAAL')}
                    className="flex-1 sm:flex-none px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                  >
                    Chaal (₹{currentChaalCost.toFixed(2)})
                  </button>
                )}

                {/* Show (Showdown) */}
                {canShow && (
                  <button
                    disabled={submittingAction}
                    onClick={() => handleAction('SHOW')}
                    className="flex-1 sm:flex-none px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-extrabold transition shadow-md animate-bounce"
                  >
                    Show!
                  </button>
                )}
              </div>
            </div>
          )}

          {myPlayerState?.isPacked && isPlaying && (
            <div className="text-center text-xs text-slate-400 py-2">
              You packed (folded) this hand. Waiting for opponents to finish...
            </div>
          )}

          {room.status === 'WAITING' && (
            <div className="text-center text-xs text-emerald-300/80 py-2">
              Waiting for players to take seats... Game begins once players join!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Individual Vector Playing Card Component ──────────────────────────────────
const CardVisual: React.FC<{ card: PlayingCard }> = ({ card }) => {
  const isRed = card.suit === 'HEARTS' || card.suit === 'DIAMONDS';
  const suitSymbol = {
    HEARTS: '♥',
    DIAMONDS: '♦',
    CLUBS: '♣',
    SPADES: '♠',
  }[card.suit] || '♠';

  return (
    <div className="w-10 h-14 sm:w-11 sm:h-16 bg-white border border-slate-300 rounded-md shadow-md flex flex-col justify-between p-1 select-none animate-flip-card">
      <div className={`text-[10px] sm:text-[11px] font-extrabold leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        {card.label}
        <span className="block text-[8px] sm:text-[9px]">{suitSymbol}</span>
      </div>
      <div className={`text-sm sm:text-base self-center leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        {suitSymbol}
      </div>
      <div className={`text-[10px] sm:text-[11px] font-extrabold leading-none self-end rotate-180 ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
        {card.label}
      </div>
    </div>
  );
};
