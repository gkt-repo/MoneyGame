import React, { useState } from 'react';
import { RoomItem, userApi, UserProfile } from '../services/api';
import { Plus, Users, Hash, KeyRound, AlertCircle, Loader2 } from 'lucide-react';

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

  // Create Room fields
  const [entryFee, setEntryFee] = useState('50');
  const [maxPlayers, setMaxPlayers] = useState('2');
  const [createGuess, setCreateGuess] = useState('7');

  // Join Room fields
  const [roomCode, setRoomCode] = useState('');
  const [joinGuess, setJoinGuess] = useState('14');

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
      const res = await userApi.createRoom(user.id, fee, parseInt(maxPlayers, 10), parseInt(createGuess, 10));
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
      const res = await userApi.joinRoom(user.id, roomCode.trim(), parseInt(joinGuess, 10));
      setShowJoinCodeModal(false);
      onSelectRoom(res.room.id);
    } catch (err: any) {
      setError(err.message || 'Failed to join table');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Active Game Tables</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Guess the secret number correctly to win the winner-takes-all prize pool!
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

      {/* Tables Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white border border-slate-200 rounded-xl">
            {loading ? 'Fetching available tables...' : 'No open tables right now. Be the first to create one!'}
          </div>
        ) : (
          rooms.map((room) => {
            const isFull = room.players.length >= room.maxPlayers;
            const prizePool = room.entryFee * room.maxPlayers;
            const userInRoom = room.players.some((p) => p.userId === user.id);

            return (
              <div
                key={room.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                      {room.roomCode}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                        isFull
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {isFull ? 'Table Full' : 'Open Seat'}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-xs text-slate-500">Entry Stake</span>
                    <span className="mono-num text-lg font-bold text-slate-900">
                      ₹{room.entryFee.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mb-3">
                    <span className="text-xs text-slate-500">Prize Pool</span>
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
                      onClick={() => onSelectRoom(room.id)}
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

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Create Custom Table</h3>
            <p className="text-xs text-slate-500 mb-4">
              Set the entry fee and choose your secret lucky guess number (1 to 100).
            </p>

            {error && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Entry Fee (₹)</label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {['20', '50', '100', '200'].map((val) => (
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
                  min={10}
                  value={entryFee}
                  onChange={(e) => setEntryFee(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mono-num font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Your Guess Number (1 to 100)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={100}
                  value={createGuess}
                  onChange={(e) => setCreateGuess(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mono-num font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>

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
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
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
              Enter the room code shared by your friend.
            </p>

            {error && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
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
                  placeholder="e.g. A3X9Y2"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm mono-num uppercase font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 tracking-widest"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Your Guess Number (1 to 100)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={100}
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
