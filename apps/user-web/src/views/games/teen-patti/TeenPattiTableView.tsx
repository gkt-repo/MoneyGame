import React, { useState, useEffect } from 'react';
import { RoomItem, userApi, UserProfile } from '../../../services/api';
import { connectSocket } from '../../../services/socket';
import { PlayingCard, TeenPattiGameState, TeenPattiPlayerState } from '@moneygame/shared-types';
import {
  Trophy,
  Eye,
  Clock,
  Coins,
  ArrowLeft,
  CheckCircle2,
  Plus,
  Minus,
  GitCompare,
  Sparkles,
  BookOpen,
  Volume2,
  VolumeX,
  Copy,
  Check,
  RotateCw,
  X,
  XCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { teenPattiSound } from './services/teenPattiSound';

interface TeenPattiTableViewProps {
  room: RoomItem;
  user: UserProfile;
  onRefreshBalance: () => void;
  onBack?: () => void;
}

/**
 * Evaluates 3-card Teen Patti hand name for UI display
 */
function evaluateTeenPattiHandName(cards?: PlayingCard[]): string {
  if (!cards || cards.length !== 3) return '';
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const [c1, c2, c3] = sorted;
  const isFlush = c1.suit === c2.suit && c2.suit === c3.suit;
  const isNormalSeq = c1.rank === c2.rank + 1 && c2.rank === c3.rank + 1;
  const isA23Seq = c1.rank === 14 && c2.rank === 3 && c3.rank === 2;
  const isSeq = isNormalSeq || isA23Seq;

  if (c1.rank === c2.rank && c2.rank === c3.rank) return `Trail (${c1.label}s)`;
  if (isSeq && isFlush) return `Pure Sequence (${isA23Seq ? 'A-2-3' : `${c1.label}-${c2.label}-${c3.label}`})`;
  if (isSeq) return `Sequence (${isA23Seq ? 'A-2-3' : `${c1.label}-${c2.label}-${c3.label}`})`;
  if (isFlush) return `Color (${c1.label} High)`;
  if (c1.rank === c2.rank) return `Pair of ${c1.label}s`;
  if (c2.rank === c3.rank) return `Pair of ${c2.label}s`;
  if (c1.rank === c3.rank) return `Pair of ${c1.label}s`;
  return `High Card (${c1.label})`;
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
  const [betMultiplier, setBetMultiplier] = useState<number>(1);
  const [sideShowBanner, setSideShowBanner] = useState<string | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isDealing, setIsDealing] = useState(false);
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

  const [myBalance, setMyBalance] = useState<number>(user.wallet?.balance ?? 0);

  const triggerDealAnimation = () => {
    setIsDealing(true);
    teenPattiSound.playCardDeal();
    setTimeout(() => {
      setIsDealing(false);
    }, 1600);
  };

  useEffect(() => {
    if (typeof user.wallet?.balance === 'number') {
      setMyBalance(user.wallet.balance);
    }
  }, [user.wallet?.balance]);

  // Sync initial game state from props if changed
  useEffect(() => {
    if (room.gameState) {
      setLocalGameState(room.gameState);
    }
  }, [room.gameState]);

  // Reset multiplier when turn changes
  useEffect(() => {
    if (localGameState?.currentTurnUserId !== user.id) {
      setBetMultiplier(1);
    }
  }, [localGameState?.currentTurnUserId, user.id]);

  // Connect to live WebSockets for instant table interactions
  useEffect(() => {
    const socket = connectSocket();
    const onConnect = () => {
      socket.emit('join_room_channel', room.id);
      userApi.getRoomDetails(room.id).then(freshRoom => {
        if (freshRoom?.gameState) {
          setLocalGameState(freshRoom.gameState);
        }
      }).catch(() => {});
    };

    socket.on('connect', onConnect);
    socket.emit('join_room_channel', room.id);

    socket.on('teen_patti_state', (state: any) => {
      if (state && (!state.roomId || state.roomId === room.id)) {
        setLocalGameState(prev => {
          if (prev && state.roundNumber > prev.roundNumber) {
            triggerDealAnimation();
          }
          return state;
        });
      }
    });

    socket.on('turn_timer_started', (data: { roomId?: string; currentTurnUserId: string; turnExpiresAt: number }) => {
      if (data && (!data.roomId || data.roomId === room.id)) {
        setLocalGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            currentTurnUserId: data.currentTurnUserId,
            turnExpiresAt: data.turnExpiresAt,
          };
        });
      }
    });

    if (room.status === 'PLAYING') {
      triggerDealAnimation();
    }

    socket.on('player_acted', (data: { roomId?: string; userId: string; action: string; betAmount: number; pot: number }) => {
      if (!data || (data.roomId && data.roomId !== room.id)) return;
      teenPattiSound.playChipToss();
      setLocalGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          pot: data.pot,
        };
      });
    });

    socket.on('player_packed', (data: { roomId?: string; userId: string; seatIndex: number }) => {
      if (!data || (data.roomId && data.roomId !== room.id)) return;
      teenPattiSound.playFold();
      setLocalGameState(prev => {
        if (!prev) return prev;
        const p = prev.players[data.userId];
        if (!p) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            [data.userId]: {
              ...p,
              isPacked: true,
            },
          },
        };
      });
    });

    socket.on('player_seen', (data: { roomId?: string; userId: string; seatIndex: number }) => {
      if (!data || (data.roomId && data.roomId !== room.id)) return;
      setLocalGameState(prev => {
        if (!prev) return prev;
        const p = prev.players[data.userId];
        if (!p) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            [data.userId]: {
              ...p,
              isSeen: true,
            },
          },
        };
      });
    });

    socket.on('side_show_result', (data: any) => {
      if (!data || (data.roomId && data.roomId !== room.id)) return;
      teenPattiSound.playChipToss();
      if (data && data.message) {
        setSideShowBanner(data.message);
        setTimeout(() => setSideShowBanner(null), 4500);
        if (data.winnerId === user.id) {
          confetti({
            particleCount: 70,
            spread: 60,
            origin: { y: 0.7 },
          });
        }
      }
    });

    socket.on('cards_revealed', (data: { roomId?: string; cards: PlayingCard[]; hand: any }) => {
      if (!data || (data.roomId && data.roomId !== room.id)) return;
      teenPattiSound.playCardFlip();
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
      if (!data || (data.roomId && data.roomId !== room.id)) return;
      teenPattiSound.playWin();
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

    socket.on('balance_updated', (data: any) => {
      if (data && typeof data.balance === 'number') {
        setMyBalance(data.balance);
      }
      onRefreshBalance();
    });

    socket.on('wallet_updated', (data: any) => {
      if (data && typeof data.balance === 'number') {
        setMyBalance(data.balance);
      }
      onRefreshBalance();
    });

    return () => {
      socket.emit('leave_room_channel', room.id);
      socket.off('connect', onConnect);
      socket.off('teen_patti_state');
      socket.off('turn_timer_started');
      socket.off('player_acted');
      socket.off('player_packed');
      socket.off('player_seen');
      socket.off('side_show_result');
      socket.off('cards_revealed');
      socket.off('game_finished');
      socket.off('balance_updated');
      socket.off('wallet_updated');
      socket.disconnect();
    };
  }, [room.id, user.id, onRefreshBalance]);

  const gameState = localGameState;
  const isCancelled = room.status === 'CANCELLED';
  const isCompleted = room.status === 'COMPLETED' || finishData !== null;
  const isPlaying = room.status === 'PLAYING' && !isCompleted && !isCancelled;

  // Find user's player state
  const myPlayerState: TeenPattiPlayerState | undefined = gameState?.players?.[user.id];
  const isMyTurn = gameState?.currentTurnUserId === user.id && isPlaying && !myPlayerState?.isPacked;

  // Turn timer calculation
  const [timeLeft, setTimeLeft] = useState<number>(25);
  useEffect(() => {
    if (!gameState?.turnExpiresAt || !isPlaying) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((gameState.turnExpiresAt! - Date.now()) / 1000));
      setTimeLeft(prev => {
        if (remaining !== prev && remaining <= 5 && remaining > 0 && isMyTurn) {
          teenPattiSound.playTimerTick();
        }
        return remaining;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [gameState?.turnExpiresAt, isPlaying, isMyTurn]);

  // Send action to server
  const handleAction = async (action: string, payload: any = {}) => {
    if (isCompleted || isCancelled) {
      setActionError(isCancelled ? 'This table was cancelled and refunded' : 'This hand has already concluded');
      return;
    }

    setSubmittingAction(true);
    setActionError(null);
    try {
      const res = await userApi.sendGameAction(room.id, action, payload);
      if (!res.success) {
        setActionError(res.message || 'Action failed');
      } else {
        if (res.wallet && typeof res.wallet.balance === 'number') {
          setMyBalance(res.wallet.balance);
        }
        if (res.gameState) {
          setLocalGameState(res.gameState);
        }
        // Sound feedback on successful actions
        if (action === 'SEE_CARDS') {
          teenPattiSound.playCardFlip();
        } else if (action === 'PACK') {
          teenPattiSound.playFold();
        } else if (action === 'CHAAL' || action === 'BLIND' || action === 'SIDE_SHOW' || action === 'SHOW') {
          teenPattiSound.playChipToss();
        }

        // If action was SEE_CARDS and cards returned, update immediately
        if (action === 'SEE_CARDS' && res.cards) {
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
                  cards: res.cards,
                },
              },
            };
          });
        }
        onRefreshBalance();
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to submit action');
    } finally {
      setSubmittingAction(false);
      setBetMultiplier(1);
    }
  };

  const activePlayers = gameState ? Object.values(gameState.players).filter(p => !p.isPacked) : [];
  const canShow = activePlayers.length === 2 && isMyTurn && !isCompleted;
  const winnerUserId = finishData?.winnerId || room.winnerId;
  const isWinner = winnerUserId === user.id;

  // Bet cost calculations with raise multiplier
  const currentChaalBase = gameState?.currentChaalAmount || room.entryFee;
  const baseBlindCost = currentChaalBase;
  const baseChaalCost = myPlayerState?.isSeen ? currentChaalBase * 2 : currentChaalBase;
  const activeBlindCost = baseBlindCost * betMultiplier;
  const activeChaalCost = baseChaalCost * betMultiplier;
  const nextMultiplierCost = myPlayerState?.isSeen ? baseChaalCost * 2 : baseBlindCost * 2;
  const showCost = activeChaalCost;

  // Determine if Side Show is available:
  // Requires 3+ active players, my turn, hero seen, and previous active player in turn order seen
  const canSideShow = (() => {
    if (!gameState || !isPlaying || !isMyTurn || !myPlayerState?.isSeen) return false;
    if (activePlayers.length < 3) return false;

    // Active players in clockwise seat order
    const sorted = [...activePlayers].sort((a, b) => a.seatIndex - b.seatIndex);
    const myIdx = sorted.findIndex(p => p.userId === user.id);
    if (myIdx === -1) return false;

    const prevIdx = (myIdx - 1 + sorted.length) % sorted.length;
    const prevPlayer = sorted[prevIdx];

    const sideShowCost = currentChaalBase * 2;
    return !!prevPlayer && prevPlayer.isSeen && myBalance >= sideShowCost;
  })();

  const hasEnoughForBlind = myBalance >= activeBlindCost;
  const hasEnoughForChaal = myBalance >= activeChaalCost;
  const hasEnoughForShow = myBalance >= showCost;
  const insufficientFundsForTurn = isMyTurn && !myPlayerState?.isPacked && (
    (!myPlayerState?.isSeen && !hasEnoughForBlind) ||
    (myPlayerState?.isSeen && !hasEnoughForChaal)
  );

  return (
    <div className="space-y-4">
      {/* ─── POKER FELT TABLE ARENA ─── */}
      <div className="relative bg-emerald-950 border-4 border-slate-800 rounded-3xl p-6 sm:p-10 shadow-xl overflow-hidden min-h-[480px] flex flex-col justify-between">
        {/* Felt Texture & Ring */}
        <div className="absolute inset-4 rounded-2xl border-2 border-emerald-500/20 pointer-events-none" />

        {/* Deal Distribution Animation Overlay */}
        {isDealing && (
          <div className="absolute inset-0 z-30 pointer-events-none flex flex-col items-center justify-center overflow-hidden">
            {/* Dealer deck at top */}
            <div className="absolute top-10 flex flex-col items-center">
              <div className="w-12 h-16 bg-slate-900 border-2 border-slate-700 rounded-lg shadow-md flex items-center justify-center text-slate-300 font-bold text-sm transform -rotate-3">
                ♠
              </div>
              <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider mt-1 bg-slate-900 px-2.5 py-0.5 rounded-full border border-slate-700 shadow-xs">
                Dealing Cards...
              </span>
            </div>

            {/* Flying Cards to All Table Seats */}
            <div className="absolute inset-0 pointer-events-none">
              <style>{`
                @keyframes webDealFlight {
                  0% {
                    opacity: 0;
                    transform: translate(-50%, -50%) scale(0.35) rotate(0deg);
                  }
                  15% {
                    opacity: 1;
                  }
                  100% {
                    opacity: 1;
                    transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1) rotate(var(--rot));
                  }
                }
              `}</style>
              {room.players.map((p, pIdx) => {
                const isMe = p.userId === user.id;
                const targetX = isMe ? 50 : ((pIdx % 2 === 0) ? 22 : 78);
                const targetY = isMe ? 85 : ((pIdx < 2) ? 38 : 64);

                return [0, 1, 2].map((cIdx) => {
                  const delayMs = (pIdx * 3 + cIdx) * 85;
                  return (
                    <div
                      key={`${p.id}-${cIdx}`}
                      style={{
                        position: 'absolute',
                        top: '14%',
                        left: '50%',
                        animation: 'webDealFlight 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                        animationDelay: `${delayMs}ms`,
                        transform: 'translate(-50%, -50%) scale(0.35)',
                        opacity: 0,
                        '--tx': `${targetX - 50}vw`,
                        '--ty': `${targetY - 14}vh`,
                        '--rot': `${(cIdx - 1) * 12}deg`,
                      } as React.CSSProperties}
                      className="w-10 h-14 bg-slate-900 border border-slate-700 rounded-md shadow-md flex items-center justify-center text-slate-300 text-xs font-bold"
                    >
                      ♠
                    </div>
                  );
                });
              })}
            </div>
          </div>
        )}

        {/* Top Bar: Table Info, Rules, Sound & Turn Notification */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-200/80 border-b border-emerald-800/50 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-wider uppercase text-amber-400 flex items-center gap-1">
              <span>🃏</span> Teen Patti
            </span>
            <span className="px-2 py-0.5 bg-emerald-900/80 border border-emerald-700/50 rounded font-mono text-[11px]">
              Boot: ₹{room.entryFee.toFixed(2)}
            </span>
            <span className="px-2.5 py-0.5 bg-emerald-800/90 border border-emerald-600/70 rounded-full font-mono text-[11px] text-emerald-200 flex items-center gap-1 font-bold shadow-xs">
              <span className="text-amber-400">💰</span>
              <span>₹{myBalance.toFixed(2)}</span>
            </span>

            {/* Copy Room Code Button */}
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(room.roomCode);
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2000);
              }}
              className="px-2 py-0.5 bg-emerald-900/80 hover:bg-emerald-800 border border-emerald-700/50 rounded font-mono text-[11px] text-emerald-200 flex items-center gap-1 transition cursor-pointer"
              title="Copy table code"
            >
              {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-emerald-300" />}
              <span>#{room.roomCode}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Rules Dialog Button (Solid non-vibe-coded) */}
            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              className="px-2.5 py-1 bg-emerald-900 hover:bg-emerald-800 border border-emerald-700 rounded-full text-emerald-200 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-xs"
              title="View Hand Rankings & Rules"
            >
              <BookOpen className="w-3 h-3 text-emerald-300" />
              <span>Rules</span>
            </button>

            {/* Sound Toggle Button */}
            <button
              type="button"
              onClick={() => {
                const nextVal = teenPattiSound.toggleSound();
                setSoundEnabled(nextVal);
              }}
              className="p-1.5 bg-emerald-900/80 hover:bg-emerald-800 border border-emerald-700/60 rounded-full text-emerald-300 transition cursor-pointer"
              title={soundEnabled ? 'Mute audio' : 'Enable audio'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {/* Replay Deal Button */}
            <button
              type="button"
              onClick={triggerDealAnimation}
              className="p-1.5 bg-emerald-900/80 hover:bg-emerald-800 border border-emerald-700/60 rounded-full text-emerald-300 transition cursor-pointer"
              title="Replay card distribution animation"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            {isPlaying && (
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition ${
                isMyTurn
                  ? timeLeft <= 5
                    ? 'bg-rose-500 text-white font-extrabold shadow-lg animate-pulse ring-2 ring-rose-300'
                    : 'bg-amber-400 text-slate-950 font-bold shadow-md animate-pulse'
                  : 'bg-emerald-900/70 text-emerald-300'
              }`}>
                <Clock className="w-3.5 h-3.5" />
                <span className="font-mono tabular-nums">
                  {isMyTurn
                    ? `Your Turn (${timeLeft}s)`
                    : myPlayerState?.isPacked
                    ? 'You Folded (Waiting)'
                    : 'Opponent Thinking...'}
                </span>
              </span>
            )}
            {isCompleted && !isCancelled && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Hand Concluded
              </span>
            )}
            {isCancelled && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500 text-white flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                Table Cancelled & Refunded
              </span>
            )}
          </div>
        </div>

        {/* Side Show Event Banner Notification */}
        {sideShowBanner && (
          <div className="relative z-20 my-2 text-center animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900/95 border-2 border-amber-400 rounded-full text-xs font-bold text-amber-300 shadow-xl">
              <GitCompare className="w-4 h-4 text-amber-400" />
              <span>{sideShowBanner}</span>
            </div>
          </div>
        )}

        {/* Center Table Area: Pot & Chips OR Final Winner Banner */}
        <div className="relative z-10 my-auto text-center py-4">
          {isCancelled ? (
            /* Cancelled Table Card */
            <div className="bg-red-950/85 border-2 border-red-500/70 rounded-2xl p-6 max-w-md mx-auto text-red-100 shadow-2xl backdrop-blur-md animate-fade-in space-y-3">
              <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto text-red-400">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-red-300">
                  Table Cancelled by Administrator
                </h3>
                <p className="text-xs text-red-200/90 mt-1 leading-relaxed">
                  All entry fees and in-game bets have been 100% refunded to your wallet balance.
                </p>
              </div>
              {onBack && (
                <div className="pt-2">
                  <button
                    onClick={onBack}
                    className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Lobby</span>
                  </button>
                </div>
              )}
            </div>
          ) : !isCompleted ? (
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
            const isSeatWinner = finishData?.winnerId === p.userId || (!finishData && isCompleted && room.winnerId === p.userId);

            return (
              <div
                key={p.id}
                className={`p-2.5 rounded-xl border transition-all duration-300 ${
                  isSeatWinner
                    ? 'bg-amber-950/70 border-amber-400 ring-2 ring-amber-400/80 shadow-[0_0_20px_rgba(251,191,36,0.4)] scale-[1.03]'
                    : isPacked
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
                  {isSeatWinner ? (
                    <span className="text-[10px] font-black text-amber-300 uppercase flex items-center gap-0.5 animate-pulse">
                      👑 Winner
                    </span>
                  ) : isPacked ? (
                    <span className="text-[10px] font-bold text-red-400 uppercase">Packed</span>
                  ) : isSeen ? (
                    <span className="text-[10px] font-bold text-cyan-300 uppercase">Seen</span>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-300 uppercase">Blind</span>
                  )}
                </div>

                {isPacked && (
                  <div className="mt-1 flex justify-center">
                    <span className="px-2 py-0.5 bg-red-950/90 text-red-300 border border-red-500/80 rounded font-black text-[9px] uppercase tracking-wider transform -rotate-6 shadow-md">
                      PACKED
                    </span>
                  </div>
                )}

                <div className="mt-1 flex items-center justify-between text-[11px] text-emerald-300/80">
                  <span>Bet: ₹{(pState?.totalBet || room.entryFee).toFixed(2)}</span>
                  {isMe && (
                    <span className="text-emerald-300 font-mono font-bold text-[10px] bg-emerald-900/80 px-1.5 py-0.5 rounded border border-emerald-600/50">
                      Bal: ₹{myBalance.toFixed(2)}
                    </span>
                  )}
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

          {insufficientFundsForTurn && (
            <p className="text-amber-300 text-xs mb-2 text-center bg-amber-950/80 py-1.5 px-3 rounded-lg border border-amber-600/60 shadow-xs">
              ⚠️ Insufficient balance (₹{myBalance.toFixed(2)}) for next bet. Please Pack (Fold).
            </p>
          )}

          {myPlayerState && !myPlayerState.isPacked && isPlaying && (
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
              {/* My 3 Cards Display */}
              <div className="flex items-center gap-3">
                {myPlayerState.isSeen && myPlayerState.cards ? (
                  // Cards Revealed with Hand Evaluator Badge
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="px-2.5 py-0.5 bg-amber-400 text-slate-950 font-black text-[10px] rounded-full shadow-xs border border-amber-300 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-800" />
                      <span>{evaluateTeenPattiHandName(myPlayerState.cards)}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {myPlayerState.cards.map((c, idx) => (
                        <CardVisual key={idx} card={c} />
                      ))}
                    </div>
                  </div>
                ) : (
                  // Face Down Cards with "See Cards" interactive prompt
                  <div
                    onClick={() => !submittingAction && handleAction('SEE_CARDS')}
                    className="group flex items-center gap-2 cursor-pointer select-none"
                    title="Click cards or button to see your cards"
                  >
                    <div className="relative flex -space-x-3 transition group-hover:scale-105">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className={`w-11 h-16 bg-slate-900 border-2 border-slate-700 rounded-lg shadow-md flex items-center justify-center transform transition ${
                            i === 0 ? '-rotate-6' : i === 2 ? 'rotate-6' : 'z-10'
                          }`}
                        >
                          <div className="w-8 h-12 border border-slate-800 rounded bg-slate-950 flex items-center justify-center text-slate-400 text-xs font-bold">
                            ♠
                          </div>
                        </div>
                      ))}

                      {/* Center "See" pill */}
                      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                        <span className="px-2.5 py-0.5 bg-slate-900 border border-slate-600 text-white font-black text-xs rounded-full shadow-sm">
                          See
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction('SEE_CARDS');
                      }}
                      disabled={submittingAction}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs border border-slate-700"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>See Cards</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons (Turn Controls with Steppers & Side Show) */}
              <div className="flex flex-col items-end gap-1.5 w-full lg:w-auto">
                {isMyTurn && timeLeft <= 5 && (
                  <div className="w-full bg-rose-500 text-white text-[11px] font-bold py-1 px-3 rounded-lg flex items-center justify-between animate-pulse shadow-sm">
                    <span>⚠️ Turn about to fold!</span>
                    <span className="font-mono tabular-nums font-black">{timeLeft}s</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
                {/* Pack / Fold */}
                <button
                  disabled={!isMyTurn || submittingAction}
                  onClick={() => handleAction('PACK')}
                  className="px-4 py-2.5 min-h-[44px] bg-red-600 hover:bg-red-700 text-white border border-red-700 rounded-xl text-xs font-bold transition disabled:opacity-30 disabled:cursor-not-allowed shadow-xs cursor-pointer"
                >
                  Pack (Fold)
                </button>

                {/* Show (Showdown - when exactly 2 players remain) */}
                {canShow && (
                  <button
                    disabled={submittingAction || !hasEnoughForShow}
                    onClick={() => handleAction('SHOW')}
                    className="px-4 py-2.5 min-h-[44px] bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-600 rounded-xl text-xs font-extrabold transition shadow-xs disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1 cursor-pointer font-mono tabular-nums"
                    title={!hasEnoughForShow ? `Insufficient balance. Required: ₹${showCost.toFixed(2)}, Available: ₹${myBalance.toFixed(2)}` : undefined}
                  >
                    <span>Show (₹{showCost.toFixed(2)})!</span>
                  </button>
                )}

                {/* Side Show (Available when 3+ players remain and prev player is seen) */}
                {activePlayers.length >= 3 && (
                  <button
                    disabled={!canSideShow || submittingAction}
                    onClick={() => handleAction('SIDE_SHOW')}
                    className={`px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs border font-mono tabular-nums ${
                      canSideShow
                        ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-600 cursor-pointer'
                        : 'bg-slate-900/60 text-slate-500 border-slate-800 opacity-40 cursor-not-allowed'
                    }`}
                    title={
                      canSideShow
                        ? `Compare hands with previous seen player for ₹${(currentChaalBase * 2).toFixed(2)}`
                        : !myPlayerState.isSeen
                        ? 'You must See Cards before asking for Side Show'
                        : 'Side show only available when previous player is also Seen'
                    }
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    <span>Side Show (₹{(currentChaalBase * 2).toFixed(2)})</span>
                  </button>
                )}

                {/* Stepper (-) to step down to 1x bet */}
                <button
                  type="button"
                  disabled={!isMyTurn || submittingAction || betMultiplier <= 1}
                  onClick={() => setBetMultiplier(1)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border transition ${
                    isMyTurn && betMultiplier > 1
                      ? 'bg-slate-700 hover:bg-slate-600 text-white border-slate-400 shadow-xs cursor-pointer'
                      : 'bg-slate-900/60 text-slate-500 border-slate-800 cursor-not-allowed opacity-40'
                  }`}
                  title="Step down to 1x bet"
                >
                  <Minus className="w-4 h-4" />
                </button>

                {/* Main Bet Button: Blind or Chaal with Multiplier */}
                {!myPlayerState.isSeen ? (
                  <button
                    disabled={!isMyTurn || submittingAction || myBalance < activeBlindCost}
                    onClick={() => handleAction('BLIND', { multiplier: betMultiplier })}
                    className="px-5 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 rounded-xl text-xs font-bold transition disabled:opacity-30 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-1.5 cursor-pointer font-mono tabular-nums"
                    title={myBalance < activeBlindCost ? `Insufficient balance. Required: ₹${activeBlindCost.toFixed(2)}, Available: ₹${myBalance.toFixed(2)}` : undefined}
                  >
                    <span>Blind (₹{activeBlindCost.toFixed(2)})</span>
                    {betMultiplier === 2 && (
                      <span className="text-[10px] bg-amber-400 text-slate-950 px-1 rounded font-bold font-sans">2x</span>
                    )}
                  </button>
                ) : (
                  <button
                    disabled={!isMyTurn || submittingAction || myBalance < activeChaalCost}
                    onClick={() => handleAction('CHAAL', { multiplier: betMultiplier })}
                    className="px-5 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 rounded-xl text-xs font-bold transition disabled:opacity-30 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-1.5 cursor-pointer font-mono tabular-nums"
                    title={myBalance < activeChaalCost ? `Insufficient balance. Required: ₹${activeChaalCost.toFixed(2)}, Available: ₹${myBalance.toFixed(2)}` : undefined}
                  >
                    <span>Chaal (₹{activeChaalCost.toFixed(2)})</span>
                    {betMultiplier === 2 && (
                      <span className="text-[10px] bg-amber-300 text-slate-950 px-1 rounded font-bold font-sans">2x</span>
                    )}
                  </button>
                )}

                {/* Stepper (+) to raise bet to 2x */}
                <button
                  type="button"
                  disabled={!isMyTurn || submittingAction || betMultiplier >= 2 || myBalance < nextMultiplierCost}
                  onClick={() => setBetMultiplier(2)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border transition ${
                    isMyTurn && betMultiplier === 1 && myBalance >= nextMultiplierCost
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 shadow-md cursor-pointer'
                      : 'bg-slate-900/60 text-slate-500 border-slate-800 cursor-not-allowed opacity-40'
                  }`}
                  title="Raise bet to 2x"
                >
                  <Plus className="w-4 h-4" />
                </button>
                </div>
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

      {/* ─── RULES & HAND RANKINGS MODAL (Matching Flutter TeenPattiRulesDialog) ─── */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-[#190623] border-2 border-amber-400 rounded-2xl p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-white/20 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🃏</span>
                <h3 className="font-extrabold text-amber-300 text-sm sm:text-base">
                  Hand Rankings (High to Low)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs max-h-[380px] overflow-y-auto pr-1">
              {[
                { rank: '1', title: 'Trail / Trio / Set', desc: 'Three cards of the same rank (e.g. A-A-A, K-K-K). AAA is highest.' },
                { rank: '2', title: 'Pure Sequence / Straight Flush', desc: 'Three consecutive cards of the same suit (e.g. A-K-Q♠, A-2-3♥).' },
                { rank: '3', title: 'Sequence / Normal Run', desc: 'Three consecutive cards not all in same suit (e.g. A-K-Q, 9-8-7).' },
                { rank: '4', title: 'Color / Flush', desc: 'Three cards of the same suit that are not in sequence (e.g. A-K-J♦).' },
                { rank: '5', title: 'Pair', desc: 'Two cards of the same rank (e.g. A-A-K, 8-8-J).' },
                { rank: '6', title: 'High Card', desc: 'Three cards that do not belong to above categories. Highest card wins.' },
              ].map((r) => (
                <div key={r.rank} className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                    {r.rank}
                  </div>
                  <div>
                    <div className="font-bold text-amber-200 text-xs sm:text-sm">{r.title}</div>
                    <div className="text-slate-300 text-[11px] leading-relaxed mt-0.5">{r.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold rounded-xl text-xs transition cursor-pointer shadow-md"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
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
