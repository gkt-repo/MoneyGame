import React, { useEffect, useState } from 'react';
import { adminApi } from '../services/api';
import { Gamepad2, Users, RefreshCw } from 'lucide-react';

export const RoomsView: React.FC = () => {
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getRooms();
      setRooms(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 tracking-tight">Active Game Tables</h2>
          <p className="text-sm text-zinc-400">Live overview of open and playing multiplayer rooms.</p>
        </div>

        <button
          onClick={fetchRooms}
          disabled={loading}
          className="self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.length === 0 ? (
          <div className="col-span-full py-16 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
            {loading ? 'Checking active tables...' : 'No active game tables at the moment.'}
          </div>
        ) : (
          rooms.map((room) => {
            const isFull = room.players?.length >= room.maxPlayers;
            return (
              <div
                key={room.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-emerald-400">
                    CODE: {room.roomCode}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      isFull
                        ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                        : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                    }`}
                  >
                    {room.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm py-1 border-b border-zinc-800">
                  <span className="text-zinc-400 text-xs">Entry Stake</span>
                  <span className="font-bold mono-num text-zinc-100">₹{room.entryFee.toFixed(2)}</span>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>Players</span>
                    </span>
                    <span className="mono-num font-semibold text-zinc-200">
                      {room.players?.length || 0} / {room.maxPlayers}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {room.players?.map((p: any) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-950 border border-zinc-800/80 rounded text-xs"
                      >
                        <span className="text-zinc-300">{p.user?.username || 'Player'}</span>
                        <span className="mono-num font-semibold text-emerald-400">
                          Guess #{p.guessNumber}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
