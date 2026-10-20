import React, { useState } from 'react';
import { RoomItem, userApi, UserProfile } from '../services/api';
import {
  Plus,
  Users,
  Tag,
  AlertCircle,
  Loader2,
  Check,
  ArrowRight,
  X,
  Lock,
  Gamepad2,
} from 'lucide-react';

interface LobbyViewProps {
  rooms: RoomItem[];
  user: UserProfile;
  balance: number;
  loading: boolean;
  onRefresh: () => void;
  onSelectRoom: (roomId: string) => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  rooms,
  user,
  balance,
  loading,
  onRefresh,
  onSelectRoom,
}) => {
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [selectedTeenPattiRoom, setSelectedTeenPattiRoom] = useState<RoomItem | null>(null);
  const [selectedDiceRoom, setSelectedDiceRoom] = useState<RoomItem | null>(null);

  // Selected game filter
  const [filterGame, setFilterGame] = useState<'ALL' | 'TEEN_PATTI' | 'GUESS_NUMBER'>('ALL');

  // Create Room fields
  const [selectedGameType, setSelectedGameType] = useState<'TEEN_PATTI' | 'GUESS_NUMBER'>('TEEN_PATTI');
  const [entryFee, setEntryFee] = useState(20);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [createGuess, setCreateGuess] = useState(7);

  // Dice quick join selected number
  const [diceJoinNumber, setDiceJoinNumber] = useState<number>(1);

  // Join Room with Code fields
  const [roomCode, setRoomCode] = useState('');
  const [codeJoinNumber, setCodeJoinNumber] = useState(5);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Teen Patti Stake options (Matching Flutter)
  const teenPattiStakes = [10, 20, 50, 100, 200, 500];
  const diceStakes = [10, 25, 50, 100];

  const teenPattiPlayerCounts = [2, 3, 4, 5, 6];
  const dicePlayerCounts = [2, 3, 4];

  // ─── CREATE ROOM HANDLER ───
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (balance < entryFee) {
      setError(`Insufficient balance (Available: ₹${balance.toFixed(2)})`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const isDice = selectedGameType === 'GUESS_NUMBER';
      const res = await userApi.createRoom(
        user.id,
        entryFee,
        maxPlayers,
        isDice ? createGuess : null,
        selectedGameType
      );
      setShowCreateModal(false);
      onSelectRoom(res.room.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create table');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── TEEN PATTI JOIN CONFIRMATION ───
  const handleConfirmTeenPattiJoin = async () => {
    if (!selectedTeenPattiRoom) return;
    if (balance < selectedTeenPattiRoom.entryFee) {
      setError(`Insufficient balance. (Available: ₹${balance.toFixed(2)})`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await userApi.joinRoom(user.id, selectedTeenPattiRoom.roomCode);
      setSelectedTeenPattiRoom(null);
      onSelectRoom(res.room.id);
    } catch (err: any) {
      setError(err.message || 'Failed to take seat');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── DICE GUESS JOIN CONFIRMATION ───
  const handleConfirmDiceJoin = async () => {
    if (!selectedDiceRoom) return;
    if (balance < selectedDiceRoom.entryFee) {
      setError(`Insufficient balance. (Available: ₹${balance.toFixed(2)})`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await userApi.joinRoom(
        user.id,
        selectedDiceRoom.roomCode,
        diceJoinNumber
      );
      setSelectedDiceRoom(null);
      onSelectRoom(res.room.id);
    } catch (err: any) {
      setError(err.message || 'Failed to join table');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── JOIN VIA CODE ───
  const handleJoinWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) {
      setError('Please enter a valid room code');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await userApi.joinRoom(
        user.id,
        roomCode.trim().toUpperCase(),
        codeJoinNumber
      );
      setShowJoinCodeModal(false);
      onSelectRoom(res.room.id);
    } catch (err: any) {
      setError(err.message || 'Failed to join table');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── OPEN TABLE CLICK ───
  const handleTableClick = (room: RoomItem) => {
    const isPlayerInRoom = room.players.some((p) => p.userId === user.id);
    const isFull = room.players.length >= room.maxPlayers;

    if (isPlayerInRoom) {
      onSelectRoom(room.id);
      return;
    }

    if (isFull) return;

    setError(null);
    if (room.gameType === 'TEEN_PATTI') {
      setSelectedTeenPattiRoom(room);
    } else {
      // Find first untaken number for dice
      const taken = new Set(room.players.map((p) => p.guessNumber).filter(Boolean));
      let firstFree = 1;
      for (let i = 1; i <= 10; i++) {
        if (!taken.has(i)) {
          firstFree = i;
          break;
        }
      }
      setDiceJoinNumber(firstFree);
      setSelectedDiceRoom(room);
    }
  };

  const filteredRooms = rooms.filter((r) => {
    if (filterGame === 'ALL') return true;
    return (r.gameType || 'GUESS_NUMBER') === filterGame;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Active Tables</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Multiplayer real-time tables with instant settlement
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => {
              setShowJoinCodeModal(true);
              setError(null);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5 text-slate-500" />
            <span>Join Code</span>
          </button>
          <button
            onClick={() => {
              setShowCreateModal(true);
              setSelectedGameType('TEEN_PATTI');
              setEntryFee(20);
              setMaxPlayers(6);
              setError(null);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Table</span>
          </button>
        </div>
      </div>

      {/* Game Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterGame('ALL')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            filterGame === 'ALL'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          All Tables ({rooms.length})
        </button>
        <button
          onClick={() => setFilterGame('TEEN_PATTI')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            filterGame === 'TEEN_PATTI'
              ? 'bg-purple-800 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>🃏</span>
          <span>Teen Patti ({rooms.filter((r) => r.gameType === 'TEEN_PATTI').length})</span>
        </button>
        <button
          onClick={() => setFilterGame('GUESS_NUMBER')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            filterGame === 'GUESS_NUMBER'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>🎲</span>
          <span>Dice Guess ({rooms.filter((r) => r.gameType === 'GUESS_NUMBER').length})</span>
        </button>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
            <span className="text-xs">Loading active tables...</span>
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="col-span-full py-16 bg-white border border-slate-200 rounded-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-400">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-800">No Active Tables Right Now</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Create a new table or invite a player with a room code to get started.
            </p>
            <button
              onClick={() => {
                setShowCreateModal(true);
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Table</span>
            </button>
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isPlayerInRoom = room.players.some((p) => p.userId === user.id);
            const isFull = room.players.length >= room.maxPlayers;
            const totalPot = room.entryFee * room.maxPlayers;
            // 90% Net winner prize (matching Flutter app pot prize calculation)
            const winnerPrize = totalPot * 0.90;
            const isTeenPatti = room.gameType === 'TEEN_PATTI';

            return (
              <div
                key={room.id}
                className={`bg-white rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 transition border ${
                  isPlayerInRoom
                    ? isTeenPatti
                      ? 'border-purple-600 ring-1 ring-purple-600/30'
                      : 'border-emerald-600 ring-1 ring-emerald-600/30'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${
                          isTeenPatti
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {isTeenPatti ? '🃏 3 PATTI' : '🎲 DICE GUESS'}
                      </span>
                      <span className="font-mono text-xs font-bold px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                        #{room.roomCode}
                      </span>
                      {isPlayerInRoom && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          JOINED
                        </span>
                      )}
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        room.status === 'WAITING'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {room.status}
                    </span>
                  </div>

                  {/* Table Stats Grid */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block">
                        {isTeenPatti ? 'BOOT' : 'ENTRY'}
                      </span>
                      <span className="font-mono text-base font-bold text-slate-900">
                        ₹{room.entryFee.toFixed(0)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block">
                        POT PRIZE
                      </span>
                      <span className="font-mono text-base font-bold text-emerald-600">
                        ₹{winnerPrize.toFixed(0)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block">
                        SEATS
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-700 mt-1 block">
                        {room.players.length} / {room.maxPlayers}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <button
                    disabled={isFull && !isPlayerInRoom}
                    onClick={() => handleTableClick(room)}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      isPlayerInRoom
                        ? 'bg-slate-900 hover:bg-slate-800 text-white'
                        : isTeenPatti
                        ? 'bg-purple-700 hover:bg-purple-800 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {isPlayerInRoom
                      ? 'Enter Active Table'
                      : isFull
                      ? 'Table Full'
                      : `Join Table (₹${room.entryFee.toFixed(0)})`}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── MODAL 1: TEEN PATTI JOIN CONFIRMATION (Matching Flutter) ─── */}
      {selectedTeenPattiRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🃏</span>
                <h3 className="text-base font-bold text-slate-900">
                  Join Teen Patti #{selectedTeenPattiRoom.roomCode}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTeenPattiRoom(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Boot Stake:</span>
                <span className="font-mono font-bold text-sm text-purple-800">
                  ₹{selectedTeenPattiRoom.entryFee.toFixed(0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Available Balance:</span>
                <span className="font-mono font-bold text-slate-900">₹{balance.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Seats Occupied:</span>
                <span className="font-mono font-semibold text-slate-700">
                  {selectedTeenPattiRoom.players.length} / {selectedTeenPattiRoom.maxPlayers} Players
                </span>
              </div>
            </div>

            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSelectedTeenPattiRoom(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmTeenPattiJoin}
                className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Confirm & Take Seat</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: DICE GUESS QUICK JOIN DIALOG (Disabling Taken Numbers) ─── */}
      {selectedDiceRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎲</span>
                <h3 className="text-base font-bold text-slate-900">
                  Join Table #{selectedDiceRoom.roomCode}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDiceRoom(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600">
              Entry Fee: <strong className="text-slate-900 font-mono">₹{selectedDiceRoom.entryFee.toFixed(0)}</strong>{' '}
              (Balance: <span className="font-mono text-emerald-700 font-bold">₹{balance.toFixed(2)}</span>)
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-2">
                Choose Your Lucky Number (1-10):
              </label>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => {
                  const takenNumbers = new Set(
                    selectedDiceRoom.players.map((p) => p.guessNumber).filter(Boolean)
                  );
                  const isTaken = takenNumbers.has(num);
                  const isSelected = diceJoinNumber === num;

                  return (
                    <button
                      key={num}
                      type="button"
                      disabled={isTaken}
                      onClick={() => setDiceJoinNumber(num)}
                      className={`h-11 rounded-xl text-sm font-bold font-mono transition flex flex-col items-center justify-center border ${
                        isTaken
                          ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed opacity-50'
                          : isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50 cursor-pointer'
                      }`}
                      title={isTaken ? 'Number already chosen by opponent' : `Pick ${num}`}
                    >
                      <span>{num}</span>
                      {isTaken && <span className="text-[8px] uppercase tracking-tighter">Taken</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSelectedDiceRoom(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmDiceJoin}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Confirm & Join</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: CREATE TABLE MODAL (Matching Flutter) ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Create Game Table</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="space-y-4">
              {/* Game Selector Cards */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Select Game</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGameType('TEEN_PATTI');
                      setEntryFee(20);
                      setMaxPlayers(6);
                    }}
                    className={`p-3.5 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      selectedGameType === 'TEEN_PATTI'
                        ? 'bg-purple-50 border-purple-600 text-purple-900 ring-2 ring-purple-600/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-2xl">🃏</span>
                    <span className="text-xs font-bold leading-tight">Teen Patti</span>
                    <span className="text-[10px] text-slate-500 font-medium">3 Cards (2-6p)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGameType('GUESS_NUMBER');
                      setEntryFee(50);
                      setMaxPlayers(2);
                    }}
                    className={`p-3.5 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
                      selectedGameType === 'GUESS_NUMBER'
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-600/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-2xl">🎲</span>
                    <span className="text-xs font-bold leading-tight">Dice Guess</span>
                    <span className="text-[10px] text-slate-500 font-medium">Number (2-4p)</span>
                  </button>
                </div>
              </div>

              {/* Stake Chips (Matching Flutter) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {selectedGameType === 'TEEN_PATTI' ? 'Boot Stake (₹)' : 'Select Entry Stake (₹)'}
                </label>
                <div className="flex flex-wrap gap-2">
                  {(selectedGameType === 'TEEN_PATTI' ? teenPattiStakes : diceStakes).map((stake) => (
                    <button
                      key={stake}
                      type="button"
                      onClick={() => setEntryFee(stake)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono border transition cursor-pointer ${
                        entryFee === stake
                          ? selectedGameType === 'TEEN_PATTI'
                            ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                            : 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ₹{stake}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Players Chips */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Max Players</label>
                <div className="flex gap-2">
                  {(selectedGameType === 'TEEN_PATTI' ? teenPattiPlayerCounts : dicePlayerCounts).map(
                    (count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setMaxPlayers(count)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          maxPlayers === count
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {count}p
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Secret Guess Number for Dice Guess ONLY */}
              {selectedGameType === 'GUESS_NUMBER' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Your Number (1-10)
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setCreateGuess(val)}
                        className={`py-1.5 rounded-lg text-xs font-bold font-mono border transition cursor-pointer ${
                          createGuess === val
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-5 py-2 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 ${
                    selectedGameType === 'TEEN_PATTI'
                      ? 'bg-purple-700 hover:bg-purple-800'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {submitting ? 'Creating...' : `Lock ₹${entryFee} & Host Table`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: JOIN VIA CODE (Matching Flutter) ─── */}
      {showJoinCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Join via Room Code</h3>
              <button
                onClick={() => setShowJoinCodeModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleJoinWithCode} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Room Code</label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={10}
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. R-1234"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base mono-num uppercase font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 tracking-wider"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Pick Your Number (If joining Dice Table, 1-10)
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setCodeJoinNumber(val)}
                      className={`py-1.5 rounded-lg text-xs font-bold font-mono border transition cursor-pointer ${
                        codeJoinNumber === val
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowJoinCodeModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !roomCode.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Joining...' : 'Join Table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
