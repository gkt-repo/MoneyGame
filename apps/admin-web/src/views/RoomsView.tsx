import React, { useEffect, useState, useMemo } from 'react';
import { adminApi, AdminRoomItem, AdminRoomPlayer } from '../services/api';
import { connectSocket } from '../services/socket';
import {
  Gamepad2,
  Users,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Trophy,
  Dices,
  Club,
  Coins,
  Copy,
  Check,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Loader2,
  Info,
} from 'lucide-react';

interface RoomsViewProps {
  onSelectUser?: (userId: string) => void;
}

export const RoomsView: React.FC<RoomsViewProps> = ({ onSelectUser }) => {
  const [rooms, setRooms] = useState<AdminRoomItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL' | 'WAITING' | 'PLAYING' | 'COMPLETED' | 'CANCELLED'>('ACTIVE');
  const [gameFilter, setGameFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Cancellation Modal State
  const [cancellingRoom, setCancellingRoom] = useState<AdminRoomItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Telemetry Counts
  const [counts, setCounts] = useState({
    total: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
  });

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getRooms(statusFilter, searchQuery);
      setRooms(res.rooms || []);
      setCounts({
        total: res.totalCount || 0,
        active: res.activeCount || 0,
        completed: res.completedCount || 0,
        cancelled: res.cancelledCount || 0,
      });
    } catch (err: any) {
      console.error('Failed to fetch admin game rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [statusFilter]);

  // Real-time socket updates for active tables
  useEffect(() => {
    const socket = connectSocket();

    const handleLobbyUpdate = () => {
      fetchRooms();
    };

    const handleRoomCancelled = () => {
      fetchRooms();
    };

    socket.on('lobby_rooms_updated', handleLobbyUpdate);
    socket.on('room_cancelled', handleRoomCancelled);
    socket.on('room_updated', handleLobbyUpdate);

    return () => {
      socket.off('lobby_rooms_updated', handleLobbyUpdate);
      socket.off('room_cancelled', handleRoomCancelled);
      socket.off('room_updated', handleLobbyUpdate);
      socket.disconnect();
    };
  }, [statusFilter, searchQuery]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRooms();
  };

  // Filter rooms by game type client-side
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (gameFilter === 'ALL') return true;
      return room.gameType === gameFilter;
    });
  }, [rooms, gameFilter]);

  // Execute admin cancellation and participant refund
  const executeCancelRoom = async () => {
    if (!cancellingRoom) return;
    setIsSubmittingCancel(true);
    setCancelError(null);
    try {
      const res = await adminApi.cancelRoom(cancellingRoom.id, cancelReason.trim() || undefined);
      setActionSuccessMessage(res.message);
      setCancellingRoom(null);
      setCancelReason('');
      await fetchRooms();
      setTimeout(() => setActionSuccessMessage(null), 8000);
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel table. Please check system logs.');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const getGameBadge = (gameType: string) => {
    switch (gameType) {
      case 'SEEP': return 'Seep';
      case 'TEEN_PATTI':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950/70 text-amber-300 border border-amber-800/50">
            <Club className="w-3 h-3 text-amber-400" />
            Teen Patti
          </span>
        );
      case 'SPORTS_MATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-sky-950/70 text-sky-300 border border-sky-800/50">
            <Trophy className="w-3 h-3 text-sky-400" />
            Sports Pool
          </span>
        );
      case 'GUESS_NUMBER':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-950/70 text-indigo-300 border border-indigo-800/50">
            <Dices className="w-3 h-3 text-indigo-400" />
            Guess Number
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'WAITING':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-950/60 text-amber-400 border border-amber-800/40 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Waiting
          </span>
        );
      case 'PLAYING':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800/50 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Playing
          </span>
        );
      case 'COUNTDOWN':
      case 'ROLLING':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-950/70 text-purple-300 border border-purple-800/50 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
            {status}
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
            Completed
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-950/70 text-red-400 border border-red-800/50 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Cancelled & Refunded
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Header & Top Actions ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-emerald-400" />
            <span>Game Tables & Table Control</span>
          </h2>
          <p className="text-sm text-zinc-400 mt-0.5">
            Real-time table oversight with authority to cancel active tables and distribute 100% refunds to participants.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchRooms}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition cursor-pointer shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : 'text-zinc-400'}`} />
            <span>Refresh Tables</span>
          </button>
        </div>
      </div>

      {/* ─── Global Action Success Banner ─────────────────────────────────── */}
      {actionSuccessMessage && (
        <div className="p-4 bg-emerald-950/80 border border-emerald-700/60 rounded-xl text-emerald-200 text-sm flex items-start justify-between gap-3 shadow-lg animate-fade-in">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-emerald-300">Table Cancelled & Refunded Successfully</p>
              <p className="text-xs text-emerald-200/90 mt-0.5">{actionSuccessMessage}</p>
            </div>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ─── Summary Stats Bar ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div>
            <div className="text-xs text-zinc-400 font-medium">Live Active Tables</div>
            <div className="text-lg font-bold text-zinc-100 font-mono">{counts.active}</div>
          </div>
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-950/60 border border-amber-800/50 flex items-center justify-center text-amber-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-zinc-400 font-medium">Total Registered Tables</div>
            <div className="text-lg font-bold text-zinc-100 font-mono">{counts.total}</div>
          </div>
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-zinc-400 font-medium">Completed Tables</div>
            <div className="text-lg font-bold text-zinc-100 font-mono">{counts.completed}</div>
          </div>
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-950/60 border border-red-800/50 flex items-center justify-center text-red-400">
            <XCircle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-zinc-400 font-medium">Cancelled Tables</div>
            <div className="text-lg font-bold text-zinc-100 font-mono">{counts.cancelled}</div>
          </div>
        </div>
      </div>

      {/* ─── Filter Tabs & Search Controls ────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-zinc-900/80 border border-zinc-800/90 p-3 rounded-xl">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          {(
            [
              { key: 'ACTIVE', label: 'Active Live' },
              { key: 'ALL', label: 'All Tables' },
              { key: 'WAITING', label: 'Waiting' },
              { key: 'PLAYING', label: 'Playing' },
              { key: 'COMPLETED', label: 'Completed' },
              { key: 'CANCELLED', label: 'Cancelled' },
            ] as const
          ).map((tab) => {
            const isSelected = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & Game Type Filter */}
        <div className="flex items-center gap-2">
          {/* Game Type Filter Dropdown */}
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-hidden focus:border-emerald-500"
          >
            <option value="ALL">All Game Types</option>
            <option value="SEEP">Seep</option>
            <option value="TEEN_PATTI">Teen Patti</option>
            <option value="GUESS_NUMBER">Guess Number</option>
            <option value="SPORTS_MATCH">Sports Pool</option>
          </select>

          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search code or player..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500"
            />
          </form>
        </div>
      </div>

      {/* ─── Tables Grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && rooms.length === 0 ? (
          <div className="col-span-full py-20 text-center text-zinc-500 bg-zinc-900/60 border border-zinc-800/80 rounded-xl flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            <span className="text-xs">Loading game tables...</span>
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="col-span-full py-16 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
            No game tables found matching filter &quot;{statusFilter}&quot;{gameFilter !== 'ALL' ? ` (${gameFilter})` : ''}.
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isFull = room.players?.length >= room.maxPlayers;
            const isActive = ['WAITING', 'COUNTDOWN', 'ROLLING', 'PLAYING'].includes(room.status);

            return (
              <div
                key={room.id}
                className={`bg-zinc-900/90 border rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all ${
                  isActive ? 'border-zinc-800 hover:border-zinc-700/90' : 'border-zinc-800/60 opacity-85'
                }`}
              >
                <div className="space-y-4">
                  {/* Top Bar: Game Type, Code & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getGameBadge(room.gameType)}
                      <button
                        onClick={() => handleCopyCode(room.roomCode)}
                        title="Copy Room Code"
                        className="font-mono text-xs font-bold px-2 py-0.5 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded text-emerald-400 flex items-center gap-1 cursor-pointer transition"
                      >
                        <span>{room.roomCode}</span>
                        {copiedCode === room.roomCode ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-2.5 h-2.5 text-zinc-500" />
                        )}
                      </button>
                    </div>

                    <div>{getStatusBadge(room.status)}</div>
                  </div>

                  {/* Financial Metrics Row */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-zinc-950/70 border border-zinc-800/80 rounded-lg text-xs">
                    <div>
                      <span className="text-zinc-500 text-[11px] block">Entry Stake</span>
                      <span className="font-bold font-mono text-zinc-200">₹{room.entryFee.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[11px] block">Total Pot / Pool</span>
                      <span className="font-bold font-mono text-emerald-400">
                        ₹{(room.totalPot || room.entryFee * (room.players?.length || 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Players Section */}
                  <div>
                    <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                      <span className="flex items-center gap-1 font-semibold">
                        <Users className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Participants</span>
                      </span>
                      <span className="font-mono font-semibold text-zinc-300">
                        {room.players?.length || 0} / {room.maxPlayers}
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                      {room.players && room.players.length > 0 ? (
                        room.players.map((p) => {
                          const isWinner = ['TWENTY_NINE', 'SEEP'].includes(room.gameType) && Array.isArray(room.customConfig?.winnerUserIds)
                            ? room.customConfig.winnerUserIds.includes(p.userId)
                            : room.winnerId === p.userId;
                          return (
                            <div
                              key={p.id}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs border ${
                                isWinner
                                  ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                                  : 'bg-zinc-950/90 border-zinc-800/80 text-zinc-300'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-mono text-[10px] text-zinc-500 bg-zinc-900 px-1 rounded">
                                  #{p.seatIndex}
                                </span>
                                {onSelectUser ? (
                                  <button
                                    onClick={() => onSelectUser(p.userId)}
                                    className="font-medium hover:text-emerald-400 truncate cursor-pointer underline decoration-zinc-700 hover:decoration-emerald-400"
                                    title="View User Profile"
                                  >
                                    {p.username}
                                  </button>
                                ) : (
                                  <span className="font-medium truncate">{p.username}</span>
                                )}
                                {isWinner && (
                                  <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {p.guessNumber != null && (
                                  <span className="font-mono font-bold text-indigo-400 text-[11px] bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-900/60">
                                    Pick #{p.guessNumber}
                                  </span>
                                )}
                                {p.inGameStake > 0 && (
                                  <span className="font-mono text-amber-400 text-[11px] bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-900/50">
                                    +₹{p.inGameStake.toFixed(2)}
                                  </span>
                                )}
                                <span className="font-mono font-semibold text-zinc-400 text-[11px]">
                                  ₹{p.totalPaid.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="py-3 text-center text-zinc-500 text-xs italic">
                          No players have joined this room yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Completed Winner Banner */}
                  {room.status === 'COMPLETED' && (
                    <div className="p-2.5 bg-emerald-950/30 border border-emerald-800/40 rounded-lg text-xs flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          {['TWENTY_NINE', 'SEEP'].includes(room.gameType) && room.customConfig?.winnerUserIds ? (
                            <>
                              Winning Team: <strong>Team {room.customConfig.winningTeamIndex + 1}</strong>
                              {room.customConfig.explanation ? (
                                <span className="block text-[11px] text-zinc-400 font-normal mt-0.5">
                                  {room.customConfig.explanation}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <>Winner: <strong>{room.winnerUsername || 'Player'}</strong></>
                          )}
                        </span>
                      </div>
                      {room.winnerPrize != null && (
                        <span className="font-mono font-bold text-amber-300">
                          ₹{room.winnerPrize.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Cancelled Banner */}
                  {room.status === 'CANCELLED' && (
                    <div className="p-2.5 bg-red-950/30 border border-red-900/40 rounded-lg text-xs text-red-300 flex items-center gap-2">
                      <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span>Table cancelled. Entry and bets refunded to all participants.</span>
                    </div>
                  )}
                </div>

                {/* ─── Bottom Actions: Cancel Table Button ─────────────────── */}
                <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-500">
                    Created {new Date(room.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {isActive ? (
                    <button
                      onClick={() => {
                        setCancellingRoom(room);
                        setCancelReason('');
                        setCancelError(null);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/60 hover:bg-red-900/80 border border-red-800/70 hover:border-red-600 text-red-200 text-xs font-bold rounded-lg transition cursor-pointer shadow-xs"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      <span>Cancel & Refund</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-zinc-500 font-medium">Concluded</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── Admin Cancel Confirmation Modal ─────────────────────────────── */}
      {cancellingRoom && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-red-700/60 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scale-in text-zinc-100">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-800/70 flex items-center justify-center text-red-400">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-red-200 tracking-tight">
                    Cancel Active Table & Refund Money
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Table #{cancellingRoom.roomCode} &bull; {cancellingRoom.gameType}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCancellingRoom(null)}
                disabled={isSubmittingCancel}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Error in modal if any */}
            {cancelError && (
              <div className="p-3 bg-red-950/80 border border-red-800 text-red-300 text-xs rounded-xl flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{cancelError}</span>
              </div>
            )}

            {/* Warning description */}
            <div className="p-3.5 bg-red-950/30 border border-red-900/40 rounded-xl text-xs text-red-200/90 space-y-1">
              <p className="font-semibold text-red-300">
                Are you sure you want to cancel this active table?
              </p>
              <p className="text-zinc-400 leading-relaxed">
                Cancelling will terminate the game immediately. The system will release all locked balances and deposit 100% of entry fees and in-game bets back into each participant&apos;s available wallet balance.
              </p>
            </div>

            {/* Participant Refund Breakdown */}
            <div>
              <div className="flex items-center justify-between text-xs text-zinc-300 font-semibold mb-2">
                <span>Refund Distribution to Participants:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  Total: ₹
                  {cancellingRoom.players
                    ?.reduce((sum, p) => sum + (p.totalPaid || cancellingRoom.entryFee), 0)
                    .toFixed(2)}
                </span>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5">
                {cancellingRoom.players && cancellingRoom.players.length > 0 ? (
                  cancellingRoom.players.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-xs px-2 py-1 rounded bg-zinc-900 border border-zinc-800/80"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-200">{p.username}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          (Entry: ₹{cancellingRoom.entryFee} + Stakes: ₹{p.inGameStake || 0})
                        </span>
                      </div>
                      <span className="font-mono font-bold text-emerald-400">
                        ₹{(p.totalPaid || cancellingRoom.entryFee).toFixed(2)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-2 text-center text-xs text-zinc-500">
                    No participants currently joined.
                  </div>
                )}
              </div>
            </div>

            {/* Optional Reason Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-300">
                Cancellation Reason (Optional):
              </label>
              <input
                type="text"
                placeholder="e.g. Stalled game, Player disconnected, Scheduled maintenance"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-red-500"
              />

              {/* Quick Reason Suggestion Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  'Stalled game / timeout',
                  'Player disconnected',
                  'Wrong table settings',
                  'Admin maintenance',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCancelReason(preset)}
                    className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 cursor-pointer transition"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setCancellingRoom(null)}
                disabled={isSubmittingCancel}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Keep Table Active
              </button>

              <button
                type="button"
                onClick={executeCancelRoom}
                disabled={isSubmittingCancel}
                className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-lg disabled:opacity-50"
              >
                {isSubmittingCancel ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Refund...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Confirm Cancel & Refund</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
