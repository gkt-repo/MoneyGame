import React from 'react';
import { CheckCircle2, Clock, Users } from 'lucide-react';
import { RoomItem } from '../../services/api';

export function CardWaitingHall({ room, userId }: { room: RoomItem; userId: string }) {
  const remaining = Math.max(0, room.maxPlayers - room.players.length);
  const starting = room.status === 'COUNTDOWN';
  const cancelled = room.status === 'CANCELLED';
  const count = room.countdown;
  return (
    <section className="overflow-hidden rounded-3xl border border-violet-200 bg-slate-950 text-white shadow-xl">
      <div className="bg-gradient-to-br from-violet-900 via-violet-950 to-slate-950 px-6 py-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">
          {room.gameType === 'SEEP' ? `Seep · ${room.maxPlayers === 4 ? '2 vs 2' : 'Head to head'}` : room.gameType === 'TWENTY_NINE' ? '29 Card Game · 2 vs 2' : 'Teen Patti'}
        </p>
        <h1 className="mt-2 text-2xl font-bold">Waiting hall</h1>
        <div className="mx-auto my-6 flex h-24 w-24 items-center justify-center rounded-full border-4 border-violet-400/40 bg-violet-400/10" aria-live="polite" aria-atomic="true">
          {starting && count != null && count > 0
            ? <span className="text-5xl font-bold tabular-nums">{count}</span>
            : <Users className="h-10 w-10 text-violet-200" />}
        </div>
        <h2 className="text-xl font-semibold" role="status">
          {cancelled ? 'Table cancelled' : starting
            ? count === 0 ? 'Opening match board…' : 'All players are here!'
            : remaining > 0 ? `Waiting for ${remaining} more player${remaining === 1 ? '' : 's'}` : 'Getting the table ready…'}
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          {cancelled ? 'Entries have been refunded. You can return to the tables.' : starting
            ? 'Your match will begin automatically after the countdown.'
            : 'Once every seat is filled, a 5-second countdown will begin.'}
        </p>
        <div className="mt-5 flex justify-center gap-6 text-sm text-violet-200">
          <span>{room.players.length} / {room.maxPlayers} players</span>
          <span>₹{room.entryFee} {room.gameType === 'TEEN_PATTI' ? 'boot' : 'entry'}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
        {Array.from({ length: room.maxPlayers }, (_, index) => {
          const player = room.players.find(p => p.seatIndex === index);
          const name = player?.user?.displayName || player?.user?.username || 'Player';
          return (
            <div key={index} className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 ${player ? 'border-violet-500/40 bg-violet-500/10' : 'border-dashed border-slate-700'}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-violet-200">
                {player ? name.charAt(0).toUpperCase() : <Clock className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{player ? `${name}${player.userId === userId ? ' (You)' : ''}` : 'Waiting for player…'}</p>
                <p className="mt-1 text-xs text-slate-400">Seat {index + 1}{(room.gameType === 'TWENTY_NINE' || (room.gameType === 'SEEP' && room.maxPlayers === 4)) ? ` · Team ${index % 2 === 0 ? 'A' : 'B'}` : ''}</p>
              </div>
              {player && <CheckCircle2 aria-label="Joined" className="h-5 w-5 shrink-0 text-emerald-400" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
