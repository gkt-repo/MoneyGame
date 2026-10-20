import React, { useState, useEffect } from 'react';
import { RoomItem, userApi, UserProfile } from '../services/api';
import {
  Plus,
  Users,
  Tag,
  AlertCircle,
  Loader2,
  Check,
  ArrowRight,
  ArrowLeft,
  X,
  Lock,
  Gamepad2,
  Trophy,
  Flame,
  Calendar,
  Sparkles,
  Search,
  RotateCw,
} from 'lucide-react';

interface LobbyViewProps {
  rooms: RoomItem[];
  user: UserProfile;
  balance: number;
  loading: boolean;
  onRefresh: () => void;
  onSelectRoom: (roomId: string) => void;
  defaultFilter?: 'ALL' | 'TEEN_PATTI' | 'GUESS_NUMBER' | 'SPORTS_MATCH';
}

const parseCustomConfig = (cfg: any): Record<string, any> => {
  if (!cfg) return {};
  if (typeof cfg === 'string') {
    try {
      return JSON.parse(cfg);
    } catch (_) {
      return {};
    }
  }
  return cfg;
};

export const formatMatchDateTime = (startTimeStr?: string) => {
  if (!startTimeStr) return { date: 'Upcoming', time: '', full: 'Upcoming' };
  const d = new Date(startTimeStr);
  if (isNaN(d.getTime())) return { date: 'Upcoming', time: '', full: 'Upcoming' };

  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear();

  const dateLabel = isToday
    ? 'Today'
    : isTomorrow
    ? 'Tomorrow'
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });

  const timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return {
    date: dateLabel,
    time: timeLabel,
    full: `${dateLabel}, ${timeLabel}`,
  };
};

export const LobbyView: React.FC<LobbyViewProps> = ({
  rooms,
  user,
  balance,
  loading,
  onRefresh,
  onSelectRoom,
  defaultFilter,
}) => {
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [selectedTeenPattiRoom, setSelectedTeenPattiRoom] = useState<RoomItem | null>(null);
  const [selectedDiceRoom, setSelectedDiceRoom] = useState<RoomItem | null>(null);
  const [selectedSportsRoom, setSelectedSportsRoom] = useState<RoomItem | null>(null);

  // Selected game filter
  const [filterGame, setFilterGame] = useState<'ALL' | 'TEEN_PATTI' | 'GUESS_NUMBER' | 'SPORTS_MATCH'>(
    defaultFilter || 'ALL'
  );

  useEffect(() => {
    if (defaultFilter) {
      setFilterGame(defaultFilter);
    }
  }, [defaultFilter]);

  // Create Room fields
  const [selectedGameType, setSelectedGameType] = useState<'TEEN_PATTI' | 'GUESS_NUMBER' | 'SPORTS_MATCH'>(
    defaultFilter === 'SPORTS_MATCH' ? 'SPORTS_MATCH' : 'TEEN_PATTI'
  );
  const [entryFee, setEntryFee] = useState(20);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [createGuess, setCreateGuess] = useState(7);

  // Sports Match Specific States
  const [sportsMatches, setSportsMatches] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  const [createSportCategory, setCreateSportCategory] = useState<string>('Cricket');
  const [createSportsSearch, setCreateSportsSearch] = useState<string>('');
  const [sportsPick, setSportsPick] = useState<1 | 2>(1); // 1 = Team 1, 2 = Team 2
  const [sportsCapacity, setSportsCapacity] = useState<number>(10); // 2, 4, 6, 10, or 1000 (Unlimited)

  const sportsCategories = [
    { id: 'Cricket', name: 'Cricket', icon: '🏏' },
    { id: 'Football', name: 'Football', icon: '⚽' },
    { id: 'Basketball', name: 'Basketball', icon: '🏀' },
    { id: 'Volleyball', name: 'Volleyball', icon: '🏐' },
    { id: 'Tennis', name: 'Tennis', icon: '🎾' },
    { id: 'ALL', name: 'All Sports', icon: '🌐' },
  ];

  // Sports Join Modal state
  const [sportsJoinTeam, setSportsJoinTeam] = useState<1 | 2>(1);

  // Dice quick join selected number
  const [diceJoinNumber, setDiceJoinNumber] = useState<number>(1);

  // Join Room with Code fields
  const [roomCode, setRoomCode] = useState('');
  const [codeJoinNumber, setCodeJoinNumber] = useState(1);
  const [codeSportsTeam, setCodeSportsTeam] = useState<1 | 2>(1);
  const [joinCodeStep, setJoinCodeStep] = useState<1 | 2>(1);
  const [codeTargetRoom, setCodeTargetRoom] = useState<RoomItem | null>(null);
  const [findingRoom, setFindingRoom] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCloseJoinCodeModal = () => {
    setShowJoinCodeModal(false);
    setJoinCodeStep(1);
    setCodeTargetRoom(null);
    setRoomCode('');
    setError(null);
    setFindingRoom(false);
  };

  // Stake options
  const teenPattiStakes = [10, 20, 50, 100, 200, 500];
  const diceStakes = [10, 25, 50, 100];
  const sportsStakes = [10, 25, 50, 100, 200, 500, 1000];

  const teenPattiPlayerCounts = [2, 3, 4, 5, 6];
  const dicePlayerCounts = [2, 3, 4];
  const sportsCapacities = [
    { label: '2 Players (1v1)', value: 2 },
    { label: '4 Players', value: 4 },
    { label: '6 Players', value: 6 },
    { label: '10 Players', value: 10 },
    { label: 'Unlimited Players', value: 1000 },
  ];

  // Fetch Live & Upcoming Sports Matches on mount
  useEffect(() => {
    let isMounted = true;
    setLoadingMatches(true);
    userApi
      .getSportsMatches()
      .then((data) => {
        if (isMounted) {
          const sorted = [...(data || [])].sort((a: any, b: any) => {
            const aLive = a.status === 'LIVE';
            const bLive = b.status === 'LIVE';
            if (aLive && !bLive) return -1;
            if (!aLive && bLive) return 1;

            const tA = a.startTime ? new Date(a.startTime).getTime() : Infinity;
            const tB = b.startTime ? new Date(b.startTime).getTime() : Infinity;
            return tA - tB;
          });
          setSportsMatches(sorted);
        }
      })
      .catch((err) => console.warn('Could not load sports matches:', err))
      .finally(() => {
        if (isMounted) setLoadingMatches(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Filtered upcoming matches for room creation based on sport & search, sorted chronologically (most recent / upcoming earliest at top)
  const filteredCreateMatches = sportsMatches
    .filter((m: any) => {
      const isFinished = m.status === 'FINISHED' || m.status === 'CANCELLED';
      const isPast = m.startTime && new Date(m.startTime).getTime() <= Date.now();
      if (isFinished || isPast) return false;

      if (
        createSportCategory !== 'ALL' &&
        m.sport?.toLowerCase() !== createSportCategory.toLowerCase()
      ) {
        return false;
      }

      if (createSportsSearch.trim()) {
        const q = createSportsSearch.toLowerCase().trim();
        const matchName = (m.name || '').toLowerCase();
        const shortName = (m.shortName || '').toLowerCase();
        const t1 = (m.team1?.name || '').toLowerCase();
        const t1Short = (m.team1?.shortName || '').toLowerCase();
        const t2 = (m.team2?.name || '').toLowerCase();
        const t2Short = (m.team2?.shortName || '').toLowerCase();
        const league = (m.league || '').toLowerCase();

        // Combined corpus with both team orders (e.g. "India vs NZ" as well as "NZ vs India")
        const combinedCorpus = `${matchName} ${shortName} ${league} ${t1} ${t1Short} ${t2} ${t2Short} ${t1} vs ${t2} ${t2} vs ${t1} ${t1} v ${t2} ${t2} v ${t1}`;
        if (combinedCorpus.includes(q)) return true;

        // Smart token matching (filter out connector words like "vs", "v", "against", "and")
        const tokens = q.split(/\s+/).filter((w) => !['vs', 'v', 'against', 'and'].includes(w));
        if (tokens.length === 0) return true;
        return tokens.every((tok) => combinedCorpus.includes(tok));
      }

      return true;
    })
    .sort((a: any, b: any) => {
      const aLive = a.status === 'LIVE';
      const bLive = b.status === 'LIVE';
      if (aLive && !bLive) return -1;
      if (!aLive && bLive) return 1;

      const tA = a.startTime ? new Date(a.startTime).getTime() : Infinity;
      const tB = b.startTime ? new Date(b.startTime).getTime() : Infinity;
      return tA - tB;
    });

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
      const isSports = selectedGameType === 'SPORTS_MATCH';

      let customConfig: Record<string, any> | undefined = undefined;
      let targetMaxPlayers = maxPlayers;
      let targetGuessNumber: number | null = null;

      if (isDice) {
        targetGuessNumber = createGuess;
      } else if (isSports) {
        if (!selectedMatch) {
          throw new Error('Please select an upcoming sports match.');
        }
        targetMaxPlayers = sportsCapacity;
        targetGuessNumber = sportsPick;
        customConfig = {
          matchId: selectedMatch.id,
          sport: selectedMatch.sport,
          league: selectedMatch.league,
          matchTitle: selectedMatch.name,
          startTime: selectedMatch.startTime,
          team1: selectedMatch.team1,
          team2: selectedMatch.team2,
          isUnlimited: sportsCapacity >= 100,
          chosenTeam: sportsPick === 1 ? selectedMatch.team1.name : selectedMatch.team2.name,
        };
      }

      const res = await userApi.createRoom(
        user.id,
        entryFee,
        targetMaxPlayers,
        targetGuessNumber,
        selectedGameType,
        customConfig
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
      const res = await userApi.joinRoom(user.id, selectedDiceRoom.roomCode, diceJoinNumber);
      setSelectedDiceRoom(null);
      onSelectRoom(res.room.id);
    } catch (err: any) {
      setError(err.message || 'Failed to join table');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── SPORTS POOL JOIN CONFIRMATION ───
  const handleConfirmSportsJoin = async () => {
    if (!selectedSportsRoom) return;
    if (balance < selectedSportsRoom.entryFee) {
      setError(`Insufficient balance. (Available: ₹${balance.toFixed(2)})`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await userApi.joinRoom(user.id, selectedSportsRoom.roomCode, sportsJoinTeam);
      setSelectedSportsRoom(null);
      onSelectRoom(res.room.id);
    } catch (err: any) {
      setError(err.message || 'Failed to join match pool');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── STEP 1: LOOKUP ROOM BY CODE ───
  const handleLookupRoomCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanCode) {
      setError('Please enter a valid room code');
      return;
    }

    setFindingRoom(true);
    setError(null);

    try {
      // 1. Try local lobby rooms first
      let target: RoomItem | undefined = rooms.find(
        (r) => r.roomCode.toUpperCase() === cleanCode
      );

      // 2. Fall back to backend lookup
      if (!target) {
        try {
          target = await userApi.getRoomByCode(cleanCode);
        } catch (err: any) {
          throw new Error(err.message || `No room found for code "${cleanCode}".`);
        }
      }

      if (!target) {
        throw new Error(`Room with code "${cleanCode}" not found.`);
      }

      // Check status
      if (target.status === 'COMPLETED' || target.status === 'CANCELLED') {
        throw new Error(`Table #${cleanCode} has already ended (${target.status.toLowerCase()}).`);
      }

      // If user is already in this room, go straight to it
      const isAlreadyIn = target.players?.some((p) => p.userId === user.id);
      if (isAlreadyIn) {
        handleCloseJoinCodeModal();
        onSelectRoom(target.id);
        return;
      }

      // Check capacity
      if (target.players && target.players.length >= target.maxPlayers) {
        throw new Error(`Table #${cleanCode} is already full (${target.players.length}/${target.maxPlayers} players).`);
      }

      // Check balance
      if (balance < target.entryFee) {
        throw new Error(
          `Insufficient balance. Entry fee is ₹${target.entryFee}, but your available balance is ₹${balance.toFixed(2)}.`
        );
      }

      // Set sensible defaults for step 2
      if (target.gameType === 'SPORTS_MATCH') {
        setCodeSportsTeam(1);
      } else if (target.gameType === 'GUESS_NUMBER') {
        const taken = new Set(target.players?.map((p) => p.guessNumber).filter(Boolean));
        let firstFree = 1;
        for (let i = 1; i <= 10; i++) {
          if (!taken.has(i)) {
            firstFree = i;
            break;
          }
        }
        setCodeJoinNumber(firstFree);
      }

      setCodeTargetRoom(target);
      setJoinCodeStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to locate table with that code');
    } finally {
      setFindingRoom(false);
    }
  };

  // ─── STEP 2: CONFIRM JOIN TABLE ───
  const handleConfirmCodeJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeTargetRoom) return;

    if (balance < codeTargetRoom.entryFee) {
      setError(`Insufficient balance. (Available: ₹${balance.toFixed(2)})`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const chosenPick =
        codeTargetRoom.gameType === 'SPORTS_MATCH'
          ? codeSportsTeam
          : codeTargetRoom.gameType === 'GUESS_NUMBER'
          ? codeJoinNumber
          : undefined;

      const res = await userApi.joinRoom(
        user.id,
        codeTargetRoom.roomCode,
        chosenPick
      );
      handleCloseJoinCodeModal();
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
    } else if (room.gameType === 'SPORTS_MATCH') {
      setSportsJoinTeam(1);
      setSelectedSportsRoom(room);
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
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Active Tables & Sports Arenas</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Multiplayer real-time tables & live sports prediction pools with instant settlement
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={onRefresh}
            disabled={loading}
            title="Refresh active tables"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => {
              setShowJoinCodeModal(true);
              setJoinCodeStep(1);
              setCodeTargetRoom(null);
              setRoomCode('');
              setError(null);
              setFindingRoom(false);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5 text-slate-500" />
            <span>Join Code</span>
          </button>
          <button
            onClick={() => {
              setShowCreateModal(true);
              if (filterGame === 'SPORTS_MATCH') {
                setSelectedGameType('SPORTS_MATCH');
                setSelectedMatch(null);
                setCreateSportsSearch('');
                setEntryFee(100);
                setSportsCapacity(10);
              } else if (filterGame === 'TEEN_PATTI') {
                setSelectedGameType('TEEN_PATTI');
                setEntryFee(20);
                setMaxPlayers(6);
              } else {
                setSelectedGameType('TEEN_PATTI');
                setEntryFee(20);
                setMaxPlayers(6);
              }
              setError(null);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Table / Pool</span>
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
          onClick={() => setFilterGame('SPORTS_MATCH')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            filterGame === 'SPORTS_MATCH'
              ? 'bg-indigo-900 text-white shadow-xs ring-1 ring-indigo-400'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>🏏</span>
          <span>Live Sports ({rooms.filter((r) => r.gameType === 'SPORTS_MATCH').length})</span>
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
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

      {/* Featured / Live Sports Marquee Banner (Visible when on SPORTS_MATCH) */}
      {filterGame === 'SPORTS_MATCH' && (
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 rounded-2xl p-5 text-white border border-indigo-800/40 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏏</span>
              <div>
                <h3 className="text-sm font-extrabold text-white tracking-wide uppercase flex items-center gap-2">
                  <span>Live & Upcoming Sports Matches</span>
                  <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-black rounded-full animate-pulse">
                    LIVE FEED
                  </span>
                </h3>
                <p className="text-[11px] text-indigo-300">
                  Select a match to create a 2p, 4p, 6p, 10p, or Unlimited player pool!
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setSelectedGameType('SPORTS_MATCH');
                setSelectedMatch(null);
                setCreateSportsSearch('');
                setShowCreateModal(true);
                setEntryFee(100);
                setSportsCapacity(10);
              }}
              className="px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Match Pool</span>
            </button>
          </div>

          {loadingMatches ? (
            <div className="py-6 flex items-center justify-center gap-2 text-indigo-300 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Loading live sports fixtures...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {sportsMatches
                .filter((m: any) => m.status !== 'FINISHED' && m.status !== 'CANCELLED')
                .slice(0, 4)
                .map((m: any) => {
                const isSelected = selectedMatch?.id === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      setSelectedMatch(m);
                      setSelectedGameType('SPORTS_MATCH');
                      setShowCreateModal(true);
                      setEntryFee(100);
                      setSportsCapacity(10);
                    }}
                    className={`p-3 rounded-xl border bg-white/5 hover:bg-white/10 transition cursor-pointer flex flex-col justify-between space-y-2.5 ${
                      isSelected ? 'border-indigo-400 ring-1 ring-indigo-400/50' : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-indigo-300 font-semibold">
                      <span>{m.sport === 'Cricket' ? '🏏 Cricket' : '⚽ Football'}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/10">{m.league}</span>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <div className="flex flex-col items-center flex-1 text-center">
                        {m.team1?.logo ? (
                          <img
                            src={m.team1.logo}
                            alt=""
                            className="w-8 h-8 object-contain drop-shadow mb-1"
                            onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-indigo-600/40 flex items-center justify-center font-bold text-xs mb-1">
                            {m.team1?.shortName || m.team1?.name?.slice(0, 2)}
                          </div>
                        )}
                        <span className="text-xs font-bold leading-tight line-clamp-1">{m.team1?.name}</span>
                      </div>

                      <span className="text-[10px] font-black text-indigo-400 px-2">VS</span>

                      <div className="flex flex-col items-center flex-1 text-center">
                        {m.team2?.logo ? (
                          <img
                            src={m.team2.logo}
                            alt=""
                            className="w-8 h-8 object-contain drop-shadow mb-1"
                            onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-purple-600/40 flex items-center justify-center font-bold text-xs mb-1">
                            {m.team2?.shortName || m.team2?.name?.slice(0, 2)}
                          </div>
                        )}
                        <span className="text-xs font-bold leading-tight line-clamp-1">{m.team2?.name}</span>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-indigo-400" />
                        {formatMatchDateTime(m.startTime).full}
                      </span>
                      <span className="font-bold text-indigo-300 hover:text-white flex items-center gap-1">
                        Create Pool <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tables Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && rooms.length === 0 ? (
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
            const isSports = room.gameType === 'SPORTS_MATCH';
            const isTeenPatti = room.gameType === 'TEEN_PATTI';
            const totalPot = isSports
              ? room.entryFee * room.players.length
              : room.entryFee * room.maxPlayers;

            const cfg = parseCustomConfig(room.customConfig);
            const isUnlimited = cfg.isUnlimited || room.maxPlayers >= 100;

            const team1Raw = cfg.team1?.name || '';
            const team2Raw = cfg.team2?.name || '';
            let matchTitle = cfg.matchTitle || '';

            let t1Name = team1Raw;
            let t2Name = team2Raw;
            if ((!t1Name || !t2Name) && matchTitle.includes(' vs ')) {
              const parts = matchTitle.split(' vs ');
              if (!t1Name && parts.length > 0) t1Name = parts[0].trim();
              if (!t2Name && parts.length > 1) t2Name = parts[1].trim();
            }
            if (!t1Name) t1Name = 'Team 1';
            if (!t2Name) t2Name = 'Team 2';
            if (!matchTitle) matchTitle = `${t1Name} vs ${t2Name}`;

            const team1 = { name: t1Name, shortName: cfg.team1?.shortName || t1Name };
            const team2 = { name: t2Name, shortName: cfg.team2?.shortName || t2Name };

            const team1Count = room.players.filter((p) => p.guessNumber === 1).length;
            const team2Count = room.players.filter((p) => p.guessNumber === 2).length;

            return (
              <div
                key={room.id}
                className={`rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 transition border ${
                  isSports
                    ? 'bg-blue-50/50 border-blue-200'
                    : isTeenPatti
                    ? 'bg-purple-50/50 border-purple-200'
                    : 'bg-emerald-50/40 border-emerald-200'
                } ${
                  isPlayerInRoom
                    ? isSports
                      ? 'border-indigo-600 ring-1 ring-indigo-600/30'
                      : isTeenPatti
                      ? 'border-purple-600 ring-1 ring-purple-600/30'
                      : 'border-emerald-600 ring-1 ring-emerald-600/30'
                    : 'hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${
                          isSports
                            ? 'bg-blue-100 text-blue-700 border-blue-300'
                            : isTeenPatti
                            ? 'bg-purple-100 text-purple-700 border-purple-300'
                            : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                        }`}
                      >
                        {isSports ? '🏏 LIVE SPORTS' : isTeenPatti ? '🃏 3 PATTI' : '🎲 DICE GUESS'}
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
                      {room.status === 'WAITING' ? 'OPEN' : room.status === 'PLAYING' ? 'LOCKED (LIVE)' : room.status}
                    </span>
                  </div>

                  {/* Sports Match Title & Horizontal Picks Bar */}
                  {isSports && (() => {
                    const totalPicks = team1Count + team2Count;
                    const team1Ratio = totalPicks === 0 ? 0.5 : team1Count / totalPicks;
                    const team1Percent = Math.round(team1Ratio * 100);
                    const team2Percent = 100 - team1Percent;

                    return (
                      <div className="mb-2 p-3 bg-white border border-blue-200 rounded-xl space-y-2">
                        <p className="text-xs font-black text-blue-950 truncate flex items-center gap-1.5">
                          <span>🏏</span>
                          <span className="truncate">{matchTitle}</span>
                        </p>

                        {/* Team Labels Row */}
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-blue-700 flex items-center gap-1.5 truncate">
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                            <span className="truncate">{team1.shortName || team1.name}: {team1Count}</span>
                          </span>
                          <span className="text-purple-700 flex items-center gap-1.5 truncate justify-end">
                            <span className="truncate">{team2.shortName || team2.name}: {team2Count}</span>
                            <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0" />
                          </span>
                        </div>

                        {/* Horizontal Picks Proportion Bar */}
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex">
                          {totalPicks === 0 ? (
                            <>
                              <div className="h-full bg-blue-300 w-1/2" />
                              <div className="w-0.5 h-full bg-white shrink-0" />
                              <div className="h-full bg-purple-300 w-1/2" />
                            </>
                          ) : (
                            <>
                              {team1Count > 0 && (
                                <div
                                  className="h-full bg-blue-600 transition-all duration-300"
                                  style={{ width: `${team1Percent}%` }}
                                />
                              )}
                              {team1Count > 0 && team2Count > 0 && <div className="w-0.5 h-full bg-white shrink-0" />}
                              {team2Count > 0 && (
                                <div
                                  className="h-full bg-purple-600 transition-all duration-300"
                                  style={{ width: `${team2Percent}%` }}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-50 rounded-xl">
                      <span className="text-[11px] text-slate-500 font-semibold block">Entry Stake</span>
                      <span className="font-bold text-slate-900 font-mono text-sm">₹{room.entryFee}</span>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-xl">
                      <span className="text-[11px] text-slate-500 font-semibold block">
                        {isSports ? 'Current Pot' : 'Winner Prize'}
                      </span>
                      <span className="font-bold text-emerald-700 font-mono text-sm">
                        ₹{totalPot.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-1 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Users className="w-3.5 h-3.5" />
                      <span>
                        {room.players.length} / {isUnlimited ? 'Unlimited' : room.maxPlayers} players
                      </span>
                    </div>
                    {isSports && cfg.startTime && (
                      <span className="text-[11px] text-slate-400">
                        Locks {formatMatchDateTime(cfg.startTime).full}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleTableClick(room)}
                    disabled={isFull && !isPlayerInRoom}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${
                      isPlayerInRoom
                        ? 'bg-slate-900 hover:bg-slate-800 text-white'
                        : isFull
                        ? 'bg-slate-100 text-slate-400 border border-slate-200'
                        : isSports
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        : isTeenPatti
                        ? 'bg-purple-700 hover:bg-purple-800 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {isPlayerInRoom ? (
                      <>
                        <span>Return to Table</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    ) : isFull ? (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Table Full</span>
                      </>
                    ) : (
                      <>
                        <span>{isSports ? 'Back a Team & Join' : 'Take a Seat'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── MODAL 1: TEEN PATTI JOIN CONFIRMATION ─── */}
      {selectedTeenPattiRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🃏</span>
                <h3 className="text-base font-bold text-slate-900">Take a Seat (Teen Patti)</h3>
              </div>
              <button
                onClick={() => setSelectedTeenPattiRoom(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-purple-50 border border-purple-100 rounded-xl space-y-1 text-xs">
              <div className="flex justify-between font-semibold text-purple-900">
                <span>Boot Amount</span>
                <span className="font-mono font-bold text-purple-950">₹{selectedTeenPattiRoom.entryFee}</span>
              </div>
              <div className="flex justify-between font-semibold text-purple-900">
                <span>Your Available Balance</span>
                <span className="font-mono font-bold text-emerald-700">₹{balance.toFixed(2)}</span>
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
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Confirm & Sit</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: SPORTS POOL JOIN MODAL ─── */}
      {selectedSportsRoom && (() => {
        const sportsCfg = parseCustomConfig(selectedSportsRoom.customConfig);
        let t1Name = sportsCfg.team1?.name || '';
        let t2Name = sportsCfg.team2?.name || '';
        let matchTitle = sportsCfg.matchTitle || '';
        if ((!t1Name || !t2Name) && matchTitle.includes(' vs ')) {
          const parts = matchTitle.split(' vs ');
          if (!t1Name && parts.length > 0) t1Name = parts[0].trim();
          if (!t2Name && parts.length > 1) t2Name = parts[1].trim();
        }
        if (!t1Name) t1Name = 'Team 1';
        if (!t2Name) t2Name = 'Team 2';
        if (!matchTitle) matchTitle = `${t1Name} vs ${t2Name}`;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🏏</span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Back Your Team</h3>
                    <p className="text-[11px] font-semibold text-blue-700">
                      {matchTitle}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSportsRoom(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Match Pick Cards */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  Which team will win this match?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Team 1 */}
                  <button
                    type="button"
                    onClick={() => setSportsJoinTeam(1)}
                    className={`p-4 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                      sportsJoinTeam === 1
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-950 ring-2 ring-indigo-600/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-extrabold line-clamp-1">
                      {t1Name}
                    </span>
                    <span className="text-[11px] text-indigo-600 font-bold">
                      {selectedSportsRoom.players.filter((p) => p.guessNumber === 1).length} picks so far
                    </span>
                  </button>

                  {/* Team 2 */}
                  <button
                    type="button"
                    onClick={() => setSportsJoinTeam(2)}
                    className={`p-4 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                      sportsJoinTeam === 2
                        ? 'bg-purple-50 border-purple-600 text-purple-950 ring-2 ring-purple-600/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-extrabold line-clamp-1">
                      {t2Name}
                    </span>
                    <span className="text-[11px] text-purple-600 font-bold">
                      {selectedSportsRoom.players.filter((p) => p.guessNumber === 2).length} picks so far
                    </span>
                  </button>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>Entry Stake</span>
                  <span className="font-mono font-bold text-slate-950">₹{selectedSportsRoom.entryFee}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>Total Pool Pot</span>
                  <span className="font-mono font-bold text-emerald-700">
                    ₹{(selectedSportsRoom.entryFee * (selectedSportsRoom.players.length + 1)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>Your Available Balance</span>
                  <span className="font-mono font-bold text-emerald-700">₹{balance.toFixed(2)}</span>
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
                  onClick={() => setSelectedSportsRoom(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirmSportsJoin}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>Lock ₹{selectedSportsRoom.entryFee} & Back Team</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── MODAL 3: DICE GUESS JOIN CONFIRMATION ─── */}
      {selectedDiceRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎲</span>
                <h3 className="text-base font-bold text-slate-900">Join Dice Table</h3>
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

      {/* ─── MODAL 4: CREATE TABLE / POOL MODAL ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-5 shadow-xl space-y-3.5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Create Table / Pool Room</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
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

            <form onSubmit={handleCreateRoom} className="space-y-3.5">
              {/* Game Selector Cards */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Select Arena / Game</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGameType('SPORTS_MATCH');
                      setEntryFee(100);
                      setSportsCapacity(10);
                    }}
                    className={`py-2 px-2.5 rounded-xl border text-left transition flex items-center gap-2 cursor-pointer ${
                      selectedGameType === 'SPORTS_MATCH'
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-900 ring-2 ring-indigo-600/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xl shrink-0">🏏</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight truncate">Live Sports</div>
                      <div className="text-[10px] text-slate-500 font-medium truncate">Cricket, Football...</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGameType('TEEN_PATTI');
                      setEntryFee(20);
                      setMaxPlayers(6);
                    }}
                    className={`py-2 px-2.5 rounded-xl border text-left transition flex items-center gap-2 cursor-pointer ${
                      selectedGameType === 'TEEN_PATTI'
                        ? 'bg-purple-50 border-purple-600 text-purple-900 ring-2 ring-purple-600/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xl shrink-0">🃏</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight truncate">Teen Patti</div>
                      <div className="text-[10px] text-slate-500 font-medium truncate">3 Cards (2-6p)</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGameType('GUESS_NUMBER');
                      setEntryFee(50);
                      setMaxPlayers(2);
                    }}
                    className={`py-2 px-2.5 rounded-xl border text-left transition flex items-center gap-2 cursor-pointer ${
                      selectedGameType === 'GUESS_NUMBER'
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-600/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xl shrink-0">🎲</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight truncate">Dice Guess</div>
                      <div className="text-[10px] text-slate-500 font-medium truncate">Number (2-4p)</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Multi-Sport Picker & Search (Only for SPORTS_MATCH) */}
              {selectedGameType === 'SPORTS_MATCH' && (
                <div className="space-y-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                  {/* Step 1: Horizontal Sport Category Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      1. Choose Sport Category
                    </label>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                      {sportsCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setCreateSportCategory(cat.id);
                            if (
                              selectedMatch &&
                              cat.id !== 'ALL' &&
                              selectedMatch.sport?.toLowerCase() !== cat.id.toLowerCase()
                            ) {
                              setSelectedMatch(null);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 border cursor-pointer ${
                            createSportCategory === cat.id
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          <span>{cat.icon}</span>
                          <span>{cat.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Step 2: Search for that specific sport */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      2. Search Upcoming Matches
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={createSportsSearch}
                        onChange={(e) => setCreateSportsSearch(e.target.value)}
                        placeholder={`Search ${
                          createSportCategory === 'ALL' ? 'all' : createSportCategory
                        } matches (e.g. IND vs AUS, teams, league)...`}
                        className="w-full pl-8 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600 transition"
                      />
                      {createSportsSearch && (
                        <button
                          type="button"
                          onClick={() => setCreateSportsSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Step 3: Match Selection List */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold text-slate-600">
                        Available Fixtures ({filteredCreateMatches.length})
                      </span>
                      {selectedMatch && (
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Match selected
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-72 sm:max-h-80 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-white">
                      {filteredCreateMatches.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400 space-y-1">
                          <p className="font-semibold text-slate-600">No upcoming matches found</p>
                          <p className="text-[11px] text-slate-400">
                            {createSportsSearch
                              ? `No matches matching "${createSportsSearch}" in ${createSportCategory}.`
                              : `No scheduled fixtures found for ${createSportCategory}. Try another sport or "All Sports".`}
                          </p>
                        </div>
                      ) : (
                        filteredCreateMatches.map((m: any) => {
                          const isSel = selectedMatch?.id === m.id;
                          const sportIcon =
                            m.sport === 'Cricket'
                              ? '🏏'
                              : m.sport === 'Football'
                              ? '⚽'
                              : m.sport === 'Basketball'
                              ? '🏀'
                              : m.sport === 'Volleyball'
                              ? '🏐'
                              : m.sport === 'Tennis'
                              ? '🎾'
                              : '🏆';

                          const dt = formatMatchDateTime(m.startTime);

                          return (
                            <div
                              key={m.id}
                              onClick={() => setSelectedMatch(m)}
                              className={`p-2.5 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between gap-2.5 ${
                                isSel
                                  ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-600/20 text-indigo-950 font-bold'
                                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-base shrink-0">{sportIcon}</span>
                                <div className="min-w-0">
                                  <p className="font-bold text-xs truncate text-slate-900">{m.name}</p>
                                  <p className="text-[10px] text-slate-400 truncate">{m.league || m.sport}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <div className="flex flex-col items-end text-right">
                                  <span className="text-[10px] font-bold text-slate-700 leading-tight">
                                    {dt.date}
                                  </span>
                                  {dt.time && (
                                    <span className="text-[10px] font-mono font-semibold text-indigo-600 leading-tight">
                                      {dt.time}
                                    </span>
                                  )}
                                </div>
                                {isSel ? (
                                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                                    <Check className="w-3 h-3" />
                                  </span>
                                ) : (
                                  <span className="w-5 h-5 rounded-full border border-slate-200 shrink-0" />
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Step 4: Creator Pick (Team 1 or Team 2) - Appears once match is selected */}
                  {selectedMatch && (
                    <div className="pt-2 border-t border-slate-200 space-y-1.5 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-800">
                          3. Choose your winning pick ({selectedMatch.name} - {formatMatchDateTime(selectedMatch.startTime).full})
                        </label>
                        <button
                          type="button"
                          onClick={() => setSelectedMatch(null)}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                        >
                          Change Match
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSportsPick(1)}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                            sportsPick === 1
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Check
                            className={`w-3.5 h-3.5 ${sportsPick === 1 ? 'opacity-100' : 'opacity-0'}`}
                          />
                          <span className="truncate">{selectedMatch.team1?.name || 'Team 1'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSportsPick(2)}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                            sportsPick === 2
                              ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Check
                            className={`w-3.5 h-3.5 ${sportsPick === 2 ? 'opacity-100' : 'opacity-0'}`}
                          />
                          <span className="truncate">{selectedMatch.team2?.name || 'Team 2'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Stake Chips */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Select Entry Stake (₹)
                </label>
                <div className="flex flex-wrap gap-2">
                  {(selectedGameType === 'SPORTS_MATCH'
                    ? sportsStakes
                    : selectedGameType === 'TEEN_PATTI'
                    ? teenPattiStakes
                    : diceStakes
                  ).map((stake) => (
                    <button
                      key={stake}
                      type="button"
                      onClick={() => setEntryFee(stake)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono border transition cursor-pointer ${
                        entryFee === stake
                          ? selectedGameType === 'SPORTS_MATCH'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : selectedGameType === 'TEEN_PATTI'
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

              {/* Capacity Chips */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Room Capacity</label>
                {selectedGameType === 'SPORTS_MATCH' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {sportsCapacities.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setSportsCapacity(item.value)}
                        className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition text-center cursor-pointer ${
                          sportsCapacity === item.value
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : (
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
                )}
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
                  disabled={submitting || (selectedGameType === 'SPORTS_MATCH' && !selectedMatch)}
                  className={`px-5 py-2 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 ${
                    selectedGameType === 'SPORTS_MATCH'
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : selectedGameType === 'TEEN_PATTI'
                      ? 'bg-purple-700 hover:bg-purple-800'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {submitting ? (
                    'Creating...'
                  ) : selectedGameType === 'SPORTS_MATCH' && !selectedMatch ? (
                    'Select an upcoming match'
                  ) : (
                    `Lock ₹${entryFee} & Host Table`
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 5: JOIN VIA CODE ─── */}
      {showJoinCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-4">
            {joinCodeStep === 1 ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-base font-bold text-slate-900">Join via Room Code</h3>
                  </div>
                  <button
                    onClick={handleCloseJoinCodeModal}
                    className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
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

                <form onSubmit={handleLookupRoomCode} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Room Code</label>
                    <input
                      type="text"
                      required
                      autoFocus
                      maxLength={20}
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      placeholder="e.g. R-1234"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base mono-num uppercase font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 tracking-wider"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Enter the room code shared by the host to find the table.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCloseJoinCodeModal}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={findingRoom || !roomCode.trim()}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {findingRoom ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Checking...</span>
                        </>
                      ) : (
                        <>
                          <span>Next</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : codeTargetRoom && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setJoinCodeStep(1);
                        setError(null);
                      }}
                      className="text-slate-400 hover:text-slate-700 p-1 -ml-1 cursor-pointer transition rounded-lg hover:bg-slate-100"
                      title="Back to Code input"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {codeTargetRoom.gameType === 'SPORTS_MATCH'
                          ? 'Back Your Team'
                          : codeTargetRoom.gameType === 'GUESS_NUMBER'
                          ? 'Choose Lucky Number'
                          : 'Table Confirmation'}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-mono">
                        Room #{codeTargetRoom.roomCode}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleCloseJoinCodeModal}
                    className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
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

                {/* Table Details Summary */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Game</span>
                    <span className="font-bold text-slate-900 flex items-center gap-1">
                      {codeTargetRoom.gameType === 'SPORTS_MATCH'
                        ? '🏏 Live Sports Pool'
                        : codeTargetRoom.gameType === 'GUESS_NUMBER'
                        ? '🎲 Dice Guess'
                        : '🃏 Teen Patti'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Entry Stake</span>
                    <span className="font-bold font-mono text-slate-900">₹{codeTargetRoom.entryFee}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Available Balance</span>
                    <span className="font-bold font-mono text-emerald-700">₹{balance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Current Players</span>
                    <span className="font-medium text-slate-700">
                      {codeTargetRoom.players.length} / {codeTargetRoom.maxPlayers === 1000 ? 'Unlimited' : codeTargetRoom.maxPlayers}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleConfirmCodeJoin} className="space-y-4">
                  {/* Next Info Asked: Sports Match Team Pick */}
                  {codeTargetRoom.gameType === 'SPORTS_MATCH' && (() => {
                    const sportsCfg = parseCustomConfig(codeTargetRoom.customConfig);
                    let t1Name = sportsCfg.team1?.name || '';
                    let t2Name = sportsCfg.team2?.name || '';
                    let matchTitle = sportsCfg.matchTitle || '';
                    if ((!t1Name || !t2Name) && matchTitle.includes(' vs ')) {
                      const parts = matchTitle.split(' vs ');
                      if (!t1Name && parts.length > 0) t1Name = parts[0].trim();
                      if (!t2Name && parts.length > 1) t2Name = parts[1].trim();
                    }
                    if (!t1Name) t1Name = 'Team 1';
                    if (!t2Name) t2Name = 'Team 2';
                    if (!matchTitle) matchTitle = `${t1Name} vs ${t2Name}`;
                    const t1Count = codeTargetRoom.players.filter((p) => p.guessNumber === 1).length;
                    const t2Count = codeTargetRoom.players.filter((p) => p.guessNumber === 2).length;

                    return (
                      <div className="space-y-2">
                        <div className="text-center font-bold text-xs text-blue-900 bg-blue-50 py-1.5 px-2.5 rounded-lg border border-blue-200">
                          🏏 {matchTitle}
                        </div>
                        <label className="block text-xs font-bold text-slate-800">
                          Which team will win this match?
                        </label>
                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={() => setCodeSportsTeam(1)}
                            className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
                              codeSportsTeam === 1
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-950 ring-2 ring-indigo-600/20'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="text-xs font-extrabold line-clamp-1">{t1Name}</span>
                            <span className="text-[10px] text-indigo-600 font-bold">
                              {t1Count} picks so far
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCodeSportsTeam(2)}
                            className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
                              codeSportsTeam === 2
                                ? 'bg-purple-50 border-purple-600 text-purple-950 ring-2 ring-purple-600/20'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="text-xs font-extrabold line-clamp-1">{t2Name}</span>
                            <span className="text-[10px] text-purple-600 font-bold">
                              {t2Count} picks so far
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Next Info Asked: Dice Guess Lucky Number */}
                  {codeTargetRoom.gameType === 'GUESS_NUMBER' && (() => {
                    const taken = new Set(codeTargetRoom.players.map((p) => p.guessNumber).filter(Boolean));
                    return (
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-800">
                          Choose Your Lucky Number (1-10):
                        </label>
                        <div className="grid grid-cols-5 gap-1.5">
                          {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => {
                            const isTaken = taken.has(num);
                            const isSelected = codeJoinNumber === num;
                            return (
                              <button
                                key={num}
                                type="button"
                                disabled={isTaken}
                                onClick={() => setCodeJoinNumber(num)}
                                className={`py-2 rounded-lg text-xs font-mono font-bold border transition ${
                                  isTaken
                                    ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed line-through'
                                    : isSelected
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-600/30'
                                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50 cursor-pointer'
                                }`}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Next Info Asked: Teen Patti Seat Confirmation */}
                  {codeTargetRoom.gameType === 'TEEN_PATTI' && (
                    <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-xl text-xs text-purple-900 space-y-1">
                      <p className="font-semibold">Ready to join this Teen Patti table?</p>
                      <p className="text-[11px] text-purple-700">
                        Confirming will reserve your seat and commit the ₹{codeTargetRoom.entryFee} boot stake.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setJoinCodeStep(1);
                        setError(null);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Joining...</span>
                        </>
                      ) : (
                        <span>
                          {codeTargetRoom.gameType === 'SPORTS_MATCH'
                            ? `Lock ₹${codeTargetRoom.entryFee} & Back Team`
                            : codeTargetRoom.gameType === 'TEEN_PATTI'
                            ? `Lock ₹${codeTargetRoom.entryFee} & Sit`
                            : `Lock ₹${codeTargetRoom.entryFee} & Join Table`}
                        </span>
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
