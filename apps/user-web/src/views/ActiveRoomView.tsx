import React, { useEffect, useState, useRef } from 'react';
import { RoomItem, userApi, UserProfile } from '../services/api';
import { connectSocket } from '../services/socket';
import { ArrowLeft, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { TeenPattiTableView } from './games/teen-patti/TeenPattiTableView';
import { GuessNumberTableView } from './games/guess-number/GuessNumberTableView';
import { SportsMatchTableView } from './games/sports-match/SportsMatchTableView';

interface ActiveRoomViewProps {
  roomId: string;
  user: UserProfile;
  onBack: () => void;
  onRefreshBalance: () => void;
}

export const ActiveRoomView: React.FC<ActiveRoomViewProps> = ({
  roomId,
  user,
  onBack,
  onRefreshBalance,
}) => {
  const [room, setRoom] = useState<RoomItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(false);

  const fetchRoom = async () => {
    try {
      const data = await userApi.getRoomDetails(roomId);
      setRoom(data);
      if (['COMPLETED', 'CANCELLED'].includes(data.status) && !finished.current) {
        finished.current = true;
        if (data.winnerId === user.id) {
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 },
          });
        }
        onRefreshBalance();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    finished.current = false;
    fetchRoom();

    const socket = connectSocket();
    const onConnect = () => {
      socket.emit('join_room_channel', roomId);
      if (!finished.current) fetchRoom();
    };
    socket.on('connect', onConnect);
    socket.emit('join_room_channel', roomId);

    socket.on('room_updated', (data: RoomItem) => {
      if (data && data.id === roomId) {
        setRoom(data);
        if (['COMPLETED', 'CANCELLED'].includes(data.status) && !finished.current) {
          finished.current = true;
          if (data.winnerId === user.id) {
            confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
          }
          onRefreshBalance();
        }
      }
    });

    socket.on('game_finished', (data: any) => {
      if (data?.room) {
        setRoom(data.room);
      }
      if (!finished.current) {
        finished.current = true;
        if (data?.winnerId === user.id) {
          confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
        }
        onRefreshBalance();
      }
    });

    const interval = setInterval(() => { if (!finished.current) fetchRoom(); }, 3000);
    return () => {
      socket.emit('leave_room_channel', roomId);
      socket.off('connect', onConnect);
      socket.disconnect();
      clearInterval(interval);
    };
  }, [roomId, user.id, onRefreshBalance]);

  if (loading || !room) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
        <span className="text-xs">Connecting to table...</span>
      </div>
    );
  }

  const isFull = room.players.length >= room.maxPlayers;
  const isWinner = room.winnerId === user.id;
  const prizePool = room.entryFee * room.maxPlayers;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tables</span>
        </button>

        <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded">
          TABLE: {room.roomCode}
        </span>
      </div>

      {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
      {room.status === 'WAITING' && (
        room.gameType === 'SPORTS_MATCH'
          ? room.players[0]?.userId === user.id && room.players.length === 1
          : room.players.some(p => p.userId === user.id)
      ) && (
        <button className="text-sm text-red-600 hover:text-red-700 underline cursor-pointer" onClick={async () => {
          try { await userApi.cancelRoom(roomId); await fetchRoom(); onRefreshBalance(); }
          catch (err) { setError(err instanceof Error ? err.message : 'Cancellation failed'); }
        }}>Cancel table and refund all entries</button>
      )}
      {/* Dynamic Game Table Rendering based on room.gameType */}
      {room.gameType === 'TEEN_PATTI' ? (
        <TeenPattiTableView
          room={room}
          user={user}
          onRefreshBalance={onRefreshBalance}
          onBack={onBack}
        />
      ) : room.gameType === 'SPORTS_MATCH' ? (
        <SportsMatchTableView
          room={room}
          user={user}
          onRefreshBalance={onRefreshBalance}
          onBack={onBack}
        />
      ) : (
        <GuessNumberTableView
          room={room}
          user={user}
        />
      )}
    </div>
  );
};
