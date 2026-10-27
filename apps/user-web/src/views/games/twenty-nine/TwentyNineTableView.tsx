import React, { useState, useEffect, useRef } from 'react';
import {
  TwentyNineGameState,
  CardSuit,
  PlayingCard,
} from '@moneygame/shared-types';
import { RoomItem, userApi, UserProfile } from '../../../services/api';
import { connectSocket } from '../../../services/socket';
import { AVATAR_ICONS } from '../../../components/ProfileModal';
import {
  Trophy,
  Clock,
  Lock,
  Unlock,
  Shield,
  Share2,
  Copy,
  Check,
  AlertCircle,
  Users,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { roomInvitationLink, roomInvitationMessage } from '../../../utils/roomInvitations';

interface TwentyNineTableViewProps {
  room: RoomItem;
  user: UserProfile;
  onRefreshBalance: () => void;
  onBack: () => void;
  onOpenPlayerProfile?: (userId: string) => void;
}

export const SUIT_SYMBOLS: Record<CardSuit, { symbol: string; color: string; label: string }> = {
  SPADES: { symbol: '♠', color: 'text-slate-900', label: 'Spades' },
  HEARTS: { symbol: '♥', color: 'text-rose-600', label: 'Hearts' },
  DIAMONDS: { symbol: '♦', color: 'text-rose-600', label: 'Diamonds' },
  CLUBS: { symbol: '♣', color: 'text-slate-900', label: 'Clubs' },
};

export const TwentyNineTableView: React.FC<TwentyNineTableViewProps> = ({
  room,
  user,
  onRefreshBalance,
  onBack,
  onOpenPlayerProfile,
}) => {
  const [gameState, setGameState] = useState<TwentyNineGameState | null>(room.gameState || null);
  const [selectedBid, setSelectedBid] = useState<number>(16);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const confettiFired = useRef(false);

  // Sync WebSocket
  useEffect(() => {
    const socket = connectSocket();
    const handleState = (incoming: TwentyNineGameState) => {
      if (!incoming || incoming.roomId !== room.id) return;
      setGameState(previous => previous && previous.sequence > incoming.sequence ? previous : incoming);
      if (incoming.phase === 'COMPLETED' && !confettiFired.current) {
        confettiFired.current = true;
        if (incoming.winningUserIds?.includes(user.id)) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        onRefreshBalance();
      }
    };
    const onConnect = () => {
      socket.emit('join_room_channel', room.id);
      void userApi.getRoomDetails(room.id).then(fresh => { if (fresh.gameState) handleState(fresh.gameState); }).catch(() => {});
    };
    socket.on('connect', onConnect);
    socket.on('twenty_nine_state', handleState);
    socket.emit('join_room_channel', room.id);

    return () => {
      socket.off('twenty_nine_state', handleState);
      socket.off('connect', onConnect);
      socket.disconnect();
    };
  }, [room.id, user.id, onRefreshBalance]);

  useEffect(() => {
    if (room.gameState?.roomId === room.id) setGameState(previous =>
      previous && previous.sequence > room.gameState.sequence ? previous : room.gameState);
  }, [room.gameState, room.id]);

  const sendAction = (action: string, data: Record<string, unknown> = {}) =>
    userApi.sendGameAction(room.id, action, { ...data, expectedSequence: gameState?.sequence, actionId: crypto.randomUUID() });

  // Turn timer countdown
  useEffect(() => {
    if (!gameState?.turnExpiresAt) {
      setTimeLeft(0);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((gameState.turnExpiresAt! - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [gameState?.turnExpiresAt]);

  // Update selectedBid default when highestBid changes
  useEffect(() => {
    if (gameState?.highestBid) {
      setSelectedBid(Math.min(28, Math.max(16, gameState.highestBid + 1)));
    } else {
      setSelectedBid(16);
    }
  }, [gameState?.highestBid]);

  // Determine user's seat and partnership
  const myPayout = gameState?.payouts?.find(p => p.userId === user.id)?.amount ?? gameState?.winnerPrizePerPlayer;
  const myPlayerState = gameState?.players[user.id];
  const mySeat = myPlayerState?.seatIndex ?? 0;
  const myTeam = myPlayerState?.teamIndex ?? 0;
  const partnerSeat = (mySeat + 2) % 4;
  const leftSeat = (mySeat + 3) % 4;
  const rightSeat = (mySeat + 1) % 4;

  const getPlayerAtSeat = (seat: number) => {
    if (!gameState) return null;
    return Object.values(gameState.players).find((p) => p.seatIndex === seat) || null;
  };

  const partnerPlayer = getPlayerAtSeat(partnerSeat);
  const leftPlayer = getPlayerAtSeat(leftSeat);
  const rightPlayer = getPlayerAtSeat(rightSeat);

  const isMyTurn = gameState?.currentTurnUserId === user.id;

  // Actions
  const handleBid = async (amount: number) => {
    setIsActing(true);
    setError(null);
    try {
      await sendAction('BID', { amount });
    } catch (err: any) {
      setError(err?.message || 'Failed to place bid');
    } finally {
      setIsActing(false);
    }
  };

  const handlePass = async () => {
    setIsActing(true);
    setError(null);
    try {
      await sendAction('PASS');
    } catch (err: any) {
      setError(err?.message || 'Failed to pass');
    } finally {
      setIsActing(false);
    }
  };

  const handleSelectTrump = async (suit: CardSuit) => {
    setIsActing(true);
    setError(null);
    try {
      await sendAction('SELECT_TRUMP', { suit });
    } catch (err: any) {
      setError(err?.message || 'Failed to select trump');
    } finally {
      setIsActing(false);
    }
  };

  const handleRevealTrump = async () => {
    setIsActing(true);
    setError(null);
    try {
      await sendAction('REVEAL_TRUMP');
    } catch (err: any) {
      setError(err?.message || 'Failed to reveal trump');
    } finally {
      setIsActing(false);
    }
  };

  const handlePlayCard = async (card: PlayingCard) => {
    if (!isMyTurn || isActing) return;
    setIsActing(true);
    setError(null);
    try {
      await sendAction('PLAY_CARD', { card });
    } catch (err: any) {
      setError(err?.message || 'Illegal card play');
    } finally {
      setIsActing(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(roomInvitationMessage(room.roomCode));
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShare = () => {
    const link = roomInvitationLink(room.roomCode);
    if (navigator.share) {
      navigator.share({
        title: 'Join my 29 Card Game Table',
        text: roomInvitationMessage(room.roomCode),
        url: link,
      }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  const isLegalCard = (card: PlayingCard) => {
    if (!isMyTurn || !myPlayerState?.legalCards) return false;
    return myPlayerState.legalCards.some((c) => c.suit === card.suit && c.label === card.label);
  };

  return (
    <div className="space-y-4">
      {gameState?.phase === 'SETTLING' && <p role="status" className="p-3 bg-amber-50 text-amber-900 rounded">Deal finished. Confirming payouts…</p>}
      {/* Table Top Header Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-xl">
            🎴
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900">29 Card Game</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                #{room.roomCode}
              </span>
              {room.isPrivate && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Private
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 font-mono">
              Entry: ₹{room.entryFee} · Pool: ₹{room.entryFee * 4}
            </div>
          </div>
        </div>

        {/* Share actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition cursor-pointer"
            title="Copy room code"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Code</span>
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-200 transition cursor-pointer"
            title="Share invite link"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>Invite</span>
          </button>
        </div>
      </div>

      {/* Game Header: Scores, Contract & Trump Status */}
      {gameState && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-3.5 rounded-xl shadow-md border border-slate-700 grid grid-cols-3 gap-2 items-center text-center">
          {/* Team 0 (South & North) */}
          <div className={`p-2 rounded-lg ${myTeam === 0 ? 'bg-emerald-950/80 border border-emerald-500/40' : 'bg-slate-800/60'}`}>
            <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-400 block">
              Team 0 {myTeam === 0 ? '(You)' : ''}
            </span>
            <span className="text-lg font-mono font-black text-white">
              {gameState.team0Points} <small className="text-xs font-normal text-slate-400">pts</small>
            </span>
          </div>

          {/* Contract / Trump Center */}
          <div className="space-y-1">
            {gameState.phase === 'BIDDING' ? (
              <div>
                <span className="text-[10px] uppercase text-amber-400 font-bold tracking-wider">Auction</span>
                <p className="text-xs font-bold font-mono text-white">
                  High: {gameState.highestBid > 0 ? `${gameState.highestBid} pts` : 'No bids'}
                </p>
              </div>
            ) : (
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-semibold">Contract: {gameState.contract} pts</span>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  {gameState.isTrumpRevealed && gameState.trumpSuit ? (
                    <span className={`text-xs font-bold flex items-center gap-1 px-2 py-0.5 rounded bg-white text-slate-900 shadow-xs`}>
                      <span className={SUIT_SYMBOLS[gameState.trumpSuit].color}>
                        {SUIT_SYMBOLS[gameState.trumpSuit].symbol}
                      </span>
                      <span>{SUIT_SYMBOLS[gameState.trumpSuit].label}</span>
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-600/30">
                      <Lock className="w-3 h-3" />
                      <span>{gameState.trumpSuit ? `${SUIT_SYMBOLS[gameState.trumpSuit].label} (Hidden)` : 'Trump Hidden'}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
            {timeLeft > 0 && (
              <div className="flex items-center justify-center gap-1 text-[11px] font-mono text-amber-300 font-bold">
                <Clock className="w-3 h-3 animate-spin" />
                <span>{timeLeft}s</span>
              </div>
            )}
          </div>

          {/* Team 1 (East & West) */}
          <div className={`p-2 rounded-lg ${myTeam === 1 ? 'bg-emerald-950/80 border border-emerald-500/40' : 'bg-slate-800/60'}`}>
            <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-400 block">
              Team 1 {myTeam === 1 ? '(You)' : ''}
            </span>
            <span className="text-lg font-mono font-black text-white">
              {gameState.team1Points} <small className="text-xs font-normal text-slate-400">pts</small>
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl flex items-center gap-2 border border-red-200">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Table Layout */}
      <div className="relative min-h-[380px] bg-gradient-to-b from-emerald-800 to-emerald-950 rounded-2xl shadow-xl border-4 border-amber-900/60 p-4 flex flex-col justify-between overflow-hidden">
        {/* Felt Texture Pattern Overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] opacity-5 pointer-events-none" />

        {/* TOP: Partner Seat */}
        <div className="flex justify-center z-10">
          <SeatBadge
            player={partnerPlayer}
            isTurn={gameState?.currentTurnUserId === partnerPlayer?.userId}
            isPartner
            isContractor={gameState?.contractorUserId === partnerPlayer?.userId}
            onOpenProfile={onOpenPlayerProfile}
          />
        </div>

        {/* MIDDLE: Left Opponent - Center Trick - Right Opponent */}
        <div className="flex items-center justify-between gap-2 z-10 my-auto">
          {/* Left Opponent */}
          <SeatBadge
            player={leftPlayer}
            isTurn={gameState?.currentTurnUserId === leftPlayer?.userId}
            isContractor={gameState?.contractorUserId === leftPlayer?.userId}
            onOpenProfile={onOpenPlayerProfile}
          />

          {/* Center Trick Arena */}
          <div className="flex-1 max-w-xs mx-auto min-h-[140px] bg-emerald-900/70 backdrop-blur-xs rounded-xl border border-emerald-600/40 p-3 flex flex-col items-center justify-center relative shadow-inner">
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-300/80 mb-2">
              Trick {gameState ? gameState.currentTrickIndex + 1 : 1}/8 · {gameState?.currentTrick.points || 0} pts
            </span>

            {/* Trick Cards Played */}
            <div className="flex items-center justify-center gap-2 min-h-[70px]">
              {gameState?.currentTrick.cards.length === 0 ? (
                <span className="text-xs text-emerald-200/50 italic">
                  {gameState.phase === 'BIDDING' ? 'Auction underway' : 'Waiting for lead card...'}
                </span>
              ) : (
                gameState?.currentTrick.cards.map((tc, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <CardVisual card={tc.card} size="sm" isTrump={tc.isTrump} />
                    <span className="text-[9px] font-mono text-emerald-200 mt-1 max-w-[50px] truncate">
                      {gameState.players[tc.userId]?.displayName || `Player`}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Reveal Trump Prompt Button */}
            {gameState?.phase === 'PLAYING' && isMyTurn && !gameState.isTrumpRevealed && gameState.canRevealTrump && (
              <button
                onClick={handleRevealTrump}
                disabled={isActing}
                className="mt-2 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold rounded-lg shadow-md flex items-center gap-1 transition cursor-pointer active:scale-95 animate-pulse"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Reveal Trump!</span>
              </button>
            )}
          </div>

          {/* Right Opponent */}
          <SeatBadge
            player={rightPlayer}
            isTurn={gameState?.currentTurnUserId === rightPlayer?.userId}
            isContractor={gameState?.contractorUserId === rightPlayer?.userId}
            onOpenProfile={onOpenPlayerProfile}
          />
        </div>

        {/* BOTTOM: Current User */}
        <div className="flex justify-center z-10">
          <SeatBadge
            player={myPlayerState}
            isTurn={isMyTurn}
            isMe
            isContractor={gameState?.contractorUserId === user.id}
            onOpenProfile={onOpenPlayerProfile}
          />
        </div>
      </div>

      {/* Bidding Auction Control Panel */}
      {gameState?.phase === 'BIDDING' && (
        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Bidding Auction (16 – 28 points)
              </span>
            </div>
            {isMyTurn && (
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 animate-pulse">
                Your Turn to Bid
              </span>
            )}
          </div>

          {isMyTurn ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                <span className="text-xs font-bold px-2 text-slate-600">Bid:</span>
                <button
                  type="button"
                  disabled={selectedBid <= Math.max(16, gameState.highestBid + 1)}
                  onClick={() => setSelectedBid((b) => Math.max(Math.max(16, gameState.highestBid + 1), b - 1))}
                  className="w-7 h-7 rounded bg-white text-slate-700 font-bold shadow-2xs hover:bg-slate-50 disabled:opacity-40"
                >
                  -
                </button>
                <span className="w-9 text-center font-mono font-bold text-slate-900 text-sm">
                  {selectedBid}
                </span>
                <button
                  type="button"
                  disabled={selectedBid >= 28}
                  onClick={() => setSelectedBid((b) => Math.min(28, b + 1))}
                  className="w-7 h-7 rounded bg-white text-slate-700 font-bold shadow-2xs hover:bg-slate-50 disabled:opacity-40"
                >
                  +
                </button>
              </div>

              <button
                onClick={() => handleBid(selectedBid)}
                disabled={isActing || selectedBid <= gameState.highestBid}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                Bid {selectedBid} pts
              </button>

              <button
                onClick={handlePass}
                disabled={isActing}
                className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Pass
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic py-1">
              Waiting for {gameState.players[gameState.currentTurnUserId || '']?.displayName || 'player'} to bid...
            </div>
          )}
        </div>
      )}

      {/* Trump Selection Modal Overlay */}
      {gameState?.phase === 'TRUMP_SELECTION' && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
              Trump Selection Phase
            </span>
          </div>

          {gameState.contractorUserId === user.id ? (
            <div className="space-y-2">
              <p className="text-xs text-amber-800">
                You won the auction with a contract of <b>{gameState.contract} points</b>! Choose a secret trump suit:
              </p>
              <div className="grid grid-cols-4 gap-2">
                {(['SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS'] as CardSuit[]).map((suit) => {
                  const s = SUIT_SYMBOLS[suit];
                  return (
                    <button
                      key={suit}
                      type="button"
                      disabled={isActing}
                      onClick={() => handleSelectTrump(suit)}
                      className="p-3 bg-white hover:bg-amber-100/50 rounded-xl border border-amber-300 shadow-xs flex flex-col items-center gap-1 transition cursor-pointer active:scale-95"
                    >
                      <span className={`text-2xl ${s.color}`}>{s.symbol}</span>
                      <span className="text-xs font-bold text-slate-800">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs text-amber-800 italic">
              Contractor <b>{gameState.players[gameState.contractorUserId || '']?.displayName}</b> is choosing the secret trump suit...
            </div>
          )}
        </div>
      )}

      {/* User Hand of Cards */}
      <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Your Hand ({myPlayerState?.cards?.length || 0} cards)
          </span>
          {isMyTurn && gameState?.phase === 'PLAYING' && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 animate-pulse">
              Your Turn to Play
            </span>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap min-h-[90px] py-1">
          {!myPlayerState?.cards || myPlayerState.cards.length === 0 ? (
            <div className="text-xs text-slate-400 italic py-4">Dealing cards...</div>
          ) : (
            myPlayerState.cards.map((c, idx) => {
              const legal = isLegalCard(c);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!legal || isActing}
                  onClick={() => handlePlayCard(c)}
                  className={`transition-all duration-150 transform ${
                    legal
                      ? 'hover:-translate-y-2 cursor-pointer shadow-md ring-2 ring-emerald-500/80 rounded-lg'
                      : isMyTurn
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:-translate-y-0.5'
                  }`}
                >
                  <CardVisual card={c} size="md" />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Game Over / Settlement Modal Overlay */}
      {gameState?.phase === 'COMPLETED' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 text-center space-y-5 animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-3xl">
              {gameState.winningUserIds?.includes(user.id) ? '🏆' : '⚔️'}
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {gameState.winningUserIds?.includes(user.id)
                  ? 'Victory! Your Team Won!'
                  : 'Hand Completed'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">{gameState.explanation}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-700">Contract Goal:</span>
                <span className="font-mono text-slate-900">{gameState.contract} points</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Team 0 Points:</span>
                <span className="font-mono font-bold text-slate-800">{gameState.team0Points} pts</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Team 1 Points:</span>
                <span className="font-mono font-bold text-slate-800">{gameState.team1Points} pts</span>
              </div>
              {gameState.winningUserIds?.includes(user.id) && myPayout !== undefined && (
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-bold text-emerald-700">
                  <span>Your Payout:</span>
                  <span className="font-mono text-sm">₹{myPayout!.toFixed(2)}</span>
                </div>
              )}
            </div>

            <button
              onClick={onBack}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition cursor-pointer"
            >
              Back to Tables
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Seat Badge Subcomponent ─────────────────────────────────────────────────

interface SeatBadgeProps {
  player: any;
  isTurn?: boolean;
  isMe?: boolean;
  isPartner?: boolean;
  isContractor?: boolean;
  onOpenProfile?: (userId: string) => void;
}

const SeatBadge: React.FC<SeatBadgeProps> = ({
  player,
  isTurn,
  isMe,
  isPartner,
  isContractor,
  onOpenProfile,
}) => {
  if (!player) {
    return (
      <div className="px-3 py-2 bg-emerald-950/40 rounded-xl border border-dashed border-emerald-700/50 text-[11px] text-emerald-300/60 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" />
        <span>Waiting...</span>
      </div>
    );
  }

  return (
    <div
      onClick={() => onOpenProfile && onOpenProfile(player.userId)}
      className={`relative px-3 py-2 rounded-xl flex items-center gap-2.5 transition cursor-pointer ${
        isTurn
          ? 'bg-amber-400 text-slate-950 ring-3 ring-amber-300 shadow-lg scale-105'
          : 'bg-slate-900/90 text-white border border-slate-700 shadow-md hover:border-slate-500'
      }`}
    >
      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-lg shrink-0">
        {AVATAR_ICONS[player.avatar] || '🦁'}
      </div>

      <div className="text-left max-w-[100px]">
        <div className="flex items-center gap-1">
          <span className="text-xs font-bold truncate block">{player.displayName || player.username}</span>
          {isContractor && (
            <span className="text-[9px] font-bold px-1 rounded bg-amber-500 text-slate-950">
              C
            </span>
          )}
        </div>
        <span className={`text-[10px] block font-medium truncate ${isTurn ? 'text-slate-800' : 'text-slate-400'}`}>
          {isMe ? 'You' : isPartner ? 'Partner' : `Team ${player.teamIndex}`}
          {player.hasPassedBid ? ' · Passed' : ''}
        </span>
      </div>
    </div>
  );
};

// ─── Card Visual Subcomponent ────────────────────────────────────────────────

interface CardVisualProps {
  card: PlayingCard;
  size?: 'sm' | 'md' | 'lg';
  isTrump?: boolean;
}

const CardVisual: React.FC<CardVisualProps> = ({ card, size = 'md', isTrump = false }) => {
  const suitInfo = SUIT_SYMBOLS[card.suit] || { symbol: '?', color: 'text-slate-900', label: '' };

  const dimensions =
    size === 'sm'
      ? 'w-11 h-16 text-xs'
      : size === 'lg'
      ? 'w-16 h-24 text-base'
      : 'w-13 h-20 text-sm';

  return (
    <div
      className={`${dimensions} bg-white rounded-lg border border-slate-300 shadow-md flex flex-col justify-between p-1 select-none relative ${
        isTrump ? 'ring-2 ring-amber-400' : ''
      }`}
    >
      {/* Top Left Rank & Suit */}
      <div className="flex items-center justify-between leading-none">
        <span className="font-bold font-mono text-slate-900">{card.label}</span>
        <span className={`${suitInfo.color} text-[11px]`}>{suitInfo.symbol}</span>
      </div>

      {/* Center Big Suit Symbol */}
      <div className={`text-center font-bold text-lg leading-none my-auto ${suitInfo.color}`}>
        {suitInfo.symbol}
      </div>

      {/* Bottom Right Rank */}
      <div className="flex items-center justify-end leading-none">
        <span className="font-bold font-mono text-[10px] text-slate-500">
          {card.label === 'J' ? '3p' : card.label === '9' ? '2p' : card.label === 'A' || card.label === '10' ? '1p' : ''}
        </span>
      </div>
    </div>
  );
};
