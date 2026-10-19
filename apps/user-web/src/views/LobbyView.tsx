import React, { useState } from 'react';
import { RoomItem, userApi, UserProfile } from '../services/api';
import { Plus, Users, Hash, KeyRound, AlertCircle, Loader2, Sparkles } from 'lucide-react';

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

  // Selected game filter
  const [filterGame, setFilterGame] = useState<'ALL' | 'TEEN_PATTI' | 'GUESS_NUMBER'>('ALL');

  // Create Room fields
  const [selectedGameType, setSelectedGameType] = useState<'TEEN_PATTI' | 'GUESS_NUMBER' | 'TWENTY_NINE'>('TEEN_PATTI');
  const [entryFee, setEntryFee] = useState('20');
  const [maxPlayers, setMaxPlayers] = useState('6');
  const [createGuess, setCreateGuess] = useState('7');

  // Join Room fields
  const [roomCode, setRoomCode] = useState('');
  const [joinGuess, setJoinGuess] = useState('5');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const fee = parseFloat(entryFee);
    if (balance < fee) {
      setError(`Insufficient balance. Please deposit at least ₹${fee.toFixed(2)}.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const isGuessGame = selectedGameType === 'GUESS_NUMBER';
      const res = await userApi.createRoom(
        user.id,
        fee,
        parseInt(maxPlayers, 10),
        isGuessGame ? parseInt(createGuess, 10) : null,
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

  const handleJoinWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await userApi.joinRoom(
        user.id,
        roomCode.trim(),
        parseInt(joinGuess, 10)
      );
      setShowJoinCodeModal(false);
      onSelectRoom(res.room.id);
    } catch (err: any) {
      setError(err.message || 'Failed to join table');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickJoin = async (room: RoomItem) => {
    setError(null);
    try {
      if (room.gameType === 'TEEN_PATTI') {
        const res = await userApi.joinRoom(user.id, room.roomCode);
        onSelectRoom(res.room.id);
      } else {
        // For guess game, open code modal prefilled
        setRoomCode(room.roomCode);
        setShowJoinCodeModal(true);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to join');
    }
  };

  const filteredRooms = rooms.filter((r) => {
    if (filterGame === 'ALL') return true;
    return (r.gameType || 'GUESS_NUMBER') === filterGame;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Game Tables</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Join multiplayer card & dice tables with real-time betting.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => {
              setShowJoinCodeModal(true);
              setError(null);
            }}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
          >
            Enter Code
          </button>
          <button
            onClick={() => {
              setShowCreateModal(true);
              setError(null);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition shadow-xs"
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
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
            filterGame === 'ALL'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          All Tables ({rooms.length})
        </button>
        <button
          onClick={() => setFilterGame('TEEN_PATTI')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            filterGame === 'TEEN_PATTI'
              ? 'bg-purple-700 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>🃏</span>
          <span>Teen Patti</span>
        </button>
        <button
          onClick={() => setFilterGame('GUESS_NUMBER')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            filterGame === 'GUESS_NUMBER'
              ? 'bg-emerald-700 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>🎲</span>
          <span>Dice Guess</span>
        </button>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
            <span className="text-xs">Loading tables...</span>
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="col-span-full py-16 bg-white border border-slate-200 rounded-xl text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Users className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No active tables right now</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Create your own table and invite friends with your table code!
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Table</span>
            </button>
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isFull = room.players.length >= room.maxPlayers;
            const prizePool = room.entryFee * room.maxPlayers;
            const userInRoom = room.players.some((p) => p.userId === user.id);
            const isTeenPatti = room.gameType === 'TEEN_PATTI';

            return (
              <div
                key={room.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        isTeenPatti
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {isTeenPatti ? '🃏 3 Patti' : '🎲 Dice Guess'}
                      </span>
                      <span className="font-mono text-xs font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {room.roomCode}
                      </span>
                    </div>

                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                        isFull
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {isFull ? 'Playing' : 'Open Seat'}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-xs text-slate-500">
                      {isTeenPatti ? 'Boot Amount' : 'Entry Stake'}
                    </span>
                    <span className="mono-num text-lg font-bold text-slate-900">
                      ₹{room.entryFee.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-xs text-slate-500">Total Pot / Pool</span>
                    <span className="mono-num text-sm font-bold text-emerald-600">
                      ₹{prizePool.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>Players</span>
                    </span>
                    <span className="mono-num font-semibold text-slate-800">
                      {room.players.length} / {room.maxPlayers}
                    </span>
                  </div>
                </div>

                <div>
                  {userInRoom ? (
                    <button
                      onClick={() => onSelectRoom(room.id)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition"
                    >
                      Re-enter Table
                    </button>
                  ) : (
                    <button
                      disabled={isFull}
                      onClick={() => handleQuickJoin(room)}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                    >
                      {isFull ? 'Table Playing' : `Join for ₹${room.entryFee.toFixed(2)}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── CREATE ROOM MODAL WITH GAME & BET SELECTION ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-xl animate-scale-up">
            <h3 className="text-base font-bold text-slate-900 mb-1">Create Game Table</h3>
            <p className="text-xs text-slate-500 mb-4">
              Select which game and betting stake to play with others.
            </p>

            {error && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="space-y-4">
              {/* Game Selector Cards */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Select Game</label>
                <div className="grid grid-cols-3 gap-2">
                  {/* Teen Patti */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGameType('TEEN_PATTI');
                      setEntryFee('20');
                      setMaxPlayers('6');
                    }}
                    className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                      selectedGameType === 'TEEN_PATTI'
                        ? 'bg-purple-50 border-purple-600 text-purple-900 ring-2 ring-purple-600/20'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xl">🃏</span>
                    <span className="text-xs font-bold leading-tight">Teen Patti</span>
                    <span className="text-[10px] text-slate-500 font-medium">3 Cards (2-6p)</span>
                  </button>

                  {/* Dice Guess */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGameType('GUESS_NUMBER');
                      setEntryFee('50');
                      setMaxPlayers('2');
                    }}
                    className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                      selectedGameType === 'GUESS_NUMBER'
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-600/20'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xl">🎲</span>
                    <span className="text-xs font-bold leading-tight">Dice Guess</span>
                    <span className="text-[10px] text-slate-500 font-medium">Lucky Roll</span>
                  </button>

                  {/* 29 Card Game (Upcoming) */}
                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 opacity-60 text-center flex flex-col items-center justify-center gap-1 cursor-not-allowed">
                    <span className="text-xl">🎴</span>
                    <span className="text-xs font-bold text-slate-600 leading-tight">29 Cards</span>
                    <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded font-semibold">
                      Coming Soon
                    </span>
                  </div>
                </div>
              </div>

              {/* Stake / Boot Amount */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {selectedGameType === 'TEEN_PATTI' ? 'Boot Amount (₹)' : 'Entry Fee (₹)'}
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {(selectedGameType === 'TEEN_PATTI' ? ['10', '20', '50', '100'] : ['20', '50', '100', '200']).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setEntryFee(val)}
                      className={`py-1.5 rounded text-xs font-bold mono-num border transition ${
                        entryFee === val
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ₹{val}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  required
                  min={1}
                  value={entryFee}
                  onChange={(e) => setEntryFee(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mono-num font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>

              {/* Max Players Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max Table Players</label>
                <div className="flex gap-2">
                  {(selectedGameType === 'TEEN_PATTI' ? ['2', '4', '6'] : ['2', '3', '4', '6']).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setMaxPlayers(count)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                        maxPlayers === count
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {count} Players
                    </button>
                  ))}
                </div>
              </div>

              {/* Guess number input ONLY if Guess Number game */}
              {selectedGameType === 'GUESS_NUMBER' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Your Secret Guess Number (1 to 10)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={10}
                    value={createGuess}
                    onChange={(e) => setCreateGuess(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mono-num font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 shadow-xs"
                >
                  {submitting ? 'Creating Table...' : 'Confirm & Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join with Code Modal */}
      {showJoinCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Join with Table Code</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter the table code shared by your friend to join.
            </p>

            {error && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleJoinWithCode} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Table Code</label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={10}
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. R-A1B2C3"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mono-num uppercase font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 tracking-widest"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lucky Guess (If joining a Dice Table, 1-10)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={joinGuess}
                  onChange={(e) => setJoinGuess(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mono-num font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinCodeModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !roomCode.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
                >
                  {submitting ? 'Joining Table...' : 'Join Table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
