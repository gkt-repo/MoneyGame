import React, { useState } from 'react';
import { RoomItem, UserProfile, userApi } from '../../../services/api';
import {
  Trophy,
  Users,
  Clock,
  Lock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Flame,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface SportsMatchTableViewProps {
  room: RoomItem;
  user: UserProfile;
  onRefreshBalance: () => void;
  onBack: () => void;
}

export const SportsMatchTableView: React.FC<SportsMatchTableViewProps> = ({
  room,
  user,
  onRefreshBalance,
  onBack,
}) => {
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config =
    typeof room.customConfig === 'string'
      ? (() => {
          try {
            return JSON.parse(room.customConfig);
          } catch (_) {
            return {};
          }
        })()
      : (room.customConfig || {});
  const team1 = config.team1 || { name: 'Team 1', shortName: 'T1' };
  const team2 = config.team2 || { name: 'Team 2', shortName: 'T2' };
  const sport = config.sport || 'Cricket';
  const league = config.league || 'Sports Duel';
  const matchTitle = config.matchTitle || `${team1.name} vs ${team2.name}`;
  const startTime = config.startTime ? new Date(config.startTime) : null;
  const isUnlimited = config.isUnlimited || room.maxPlayers >= 100;

  const totalPot = room.entryFee * room.players.length;
  const team1Players = room.players.filter((p) => p.guessNumber === 1);
  const team2Players = room.players.filter((p) => p.guessNumber === 2);

  const team1PotentialPayout =
    team1Players.length > 0 ? (totalPot / team1Players.length).toFixed(2) : totalPot.toFixed(2);
  const team2PotentialPayout =
    team2Players.length > 0 ? (totalPot / team2Players.length).toFixed(2) : totalPot.toFixed(2);

  const myPlayer = room.players.find((p) => p.userId === user.id);
  const myPick = myPlayer ? myPlayer.guessNumber : null;
  const myPickName = myPick === 1 ? team1.name : myPick === 2 ? team2.name : null;

  const isCompleted = room.status === 'COMPLETED';
  const isCancelled = room.status === 'CANCELLED';
  const isLocked = room.status === 'PLAYING' || isCompleted || isCancelled;

  const winningTeamIndex = room.winningNumber;
  const winningTeamName =
    winningTeamIndex === 1 ? team1.name : winningTeamIndex === 2 ? team2.name : config.settlement?.winningTeamName;

  const didIWin = isCompleted && myPick === winningTeamIndex;

  // Simulate result for testing
  const handleSimulate = async (teamIndex: number, teamName: string) => {
    setSimulating(true);
    setError(null);
    try {
      await userApi.settleSportsRoom(room.id, teamIndex, teamName);
      if (myPick === teamIndex) {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }
      onRefreshBalance();
    } catch (err: any) {
      setError(err.message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  const handleSimulateRefund = async () => {
    setSimulating(true);
    setError(null);
    try {
      await userApi.settleSportsRoom(room.id, 0, 'Refund', true);
      onRefreshBalance();
    } catch (err: any) {
      setError(err.message || 'Refund simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Match Header Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-slate-700/50">
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          {/* League & Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full font-bold tracking-wide uppercase text-indigo-300">
                {sport === 'Cricket' ? '🏏' : '⚽'} {sport}
              </span>
              <span className="text-slate-400 font-semibold">{league}</span>
            </div>

            <div className="flex items-center gap-2">
              {isCompleted ? (
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Finished & Settled</span>
                </span>
              ) : isCancelled ? (
                <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Refunded</span>
                </span>
              ) : isLocked ? (
                <span className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full font-bold flex items-center gap-1.5 animate-pulse">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Live Match (Entries Locked)</span>
                </span>
              ) : (
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Open for Predictions</span>
                </span>
              )}
            </div>
          </div>

          {/* Teams Faceoff Banner */}
          <div className="grid grid-cols-11 items-center gap-2 py-4">
            {/* Team 1 */}
            <div className="col-span-5 flex flex-col items-center text-center p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
              {team1.logo ? (
                <img
                  src={team1.logo}
                  alt={team1.name}
                  className="w-16 h-16 object-contain drop-shadow-md mb-2"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-indigo-600/30 flex items-center justify-center font-bold text-xl mb-2">
                  {team1.shortName || team1.name.slice(0, 3)}
                </div>
              )}
              <h3 className="font-extrabold text-base sm:text-lg leading-tight text-white">{team1.name}</h3>
              {team1.score && <span className="text-xs font-mono text-emerald-400 mt-1">{team1.score}</span>}
              <div className="mt-3 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {team1Players.length} Backers
              </div>
            </div>

            {/* VS Badge */}
            <div className="col-span-1 flex flex-col items-center justify-center">
              <span className="font-black text-xs sm:text-sm text-slate-400 tracking-widest bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700">
                VS
              </span>
            </div>

            {/* Team 2 */}
            <div className="col-span-5 flex flex-col items-center text-center p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
              {team2.logo ? (
                <img
                  src={team2.logo}
                  alt={team2.name}
                  className="w-16 h-16 object-contain drop-shadow-md mb-2"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-purple-600/30 flex items-center justify-center font-bold text-xl mb-2">
                  {team2.shortName || team2.name.slice(0, 3)}
                </div>
              )}
              <h3 className="font-extrabold text-base sm:text-lg leading-tight text-white">{team2.name}</h3>
              {team2.score && <span className="text-xs font-mono text-purple-400 mt-1">{team2.score}</span>}
              <div className="mt-3 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {team2Players.length} Backers
              </div>
            </div>
          </div>

          {/* User's Choice Highlight */}
          {myPick && (
            <div
              className={`p-3.5 rounded-2xl flex items-center justify-between border ${
                myPick === 1
                  ? 'bg-indigo-950/60 border-indigo-500/40 text-indigo-200'
                  : 'bg-purple-950/60 border-purple-500/40 text-purple-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
                <span className="text-xs font-semibold">Your Prediction:</span>
                <span className="font-extrabold text-white text-sm">{myPickName}</span>
              </div>
              <div className="text-xs">
                <span className="text-slate-400">Potential Payout: </span>
                <span className="font-mono font-bold text-emerald-400">
                  ₹{myPick === 1 ? team1PotentialPayout : team2PotentialPayout}
                </span>
              </div>
            </div>
          )}

          {/* Settlement / Outcome Banner */}
          {isCompleted && (
            <div
              className={`p-4 rounded-2xl border text-center space-y-1.5 ${
                didIWin
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-100'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Trophy className={`w-5 h-5 ${didIWin ? 'text-amber-300' : 'text-slate-400'}`} />
                <span className="font-black text-sm uppercase tracking-wide">
                  Match Winner: {winningTeamName}
                </span>
              </div>
              {didIWin ? (
                <p className="text-xs font-bold text-emerald-300">
                  🎉 Congratulations! You backed {winningTeamName} and won your share of the ₹{totalPot.toFixed(2)}{' '}
                  pool!
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  The match concluded with {winningTeamName} winning. Better luck in the next match!
                </p>
              )}
            </div>
          )}

          {isCancelled && (
            <div className="p-4 rounded-2xl bg-amber-950/80 border border-amber-500/50 text-amber-200 text-center space-y-1">
              <span className="font-black text-sm uppercase tracking-wide">Match Refunded</span>
              <p className="text-xs text-amber-300">
                100% of your ₹{room.entryFee.toFixed(2)} entry fee has been returned to your wallet.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pool Breakdown & Odds Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-emerald-600" />
            <h4 className="font-bold text-sm text-slate-900">Pool Distribution & Pot</h4>
          </div>
          <span className="font-mono text-sm font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
            Total Pot: ₹{totalPot.toFixed(2)}
          </span>
        </div>

        {/* Visual Pool Split Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-semibold text-slate-600">
            <span>
              {team1.name} ({team1Players.length} picks)
            </span>
            <span>
              {team2.name} ({team2Players.length} picks)
            </span>
          </div>
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
            <div
              className="bg-indigo-600 h-full transition-all duration-500"
              style={{
                width: `${
                  room.players.length > 0 ? (team1Players.length / room.players.length) * 100 : 50
                }%`,
              }}
            />
            <div
              className="bg-purple-600 h-full transition-all duration-500"
              style={{
                width: `${
                  room.players.length > 0 ? (team2Players.length / room.players.length) * 100 : 50
                }%`,
              }}
            />
          </div>
        </div>

        {/* Potential Payout Formula Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-xs text-indigo-900 font-semibold">
              <span>If {team1.name} Wins</span>
              <span className="font-bold font-mono text-indigo-700">₹{team1PotentialPayout}/winner</span>
            </div>
            <p className="text-[11px] text-indigo-700/80">
              ₹{totalPot.toFixed(2)} total pot divided equally among {team1Players.length || 1} backer(s).
            </p>
          </div>

          <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-xs text-purple-900 font-semibold">
              <span>If {team2.name} Wins</span>
              <span className="font-bold font-mono text-purple-700">₹{team2PotentialPayout}/winner</span>
            </div>
            <p className="text-[11px] text-purple-700/80">
              ₹{totalPot.toFixed(2)} total pot divided equally among {team2Players.length || 1} backer(s).
            </p>
          </div>
        </div>
      </div>

      {/* Participants List */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-600" />
            <h4 className="font-bold text-sm text-slate-900">
              Table Participants ({room.players.length} / {isUnlimited ? 'Unlimited' : room.maxPlayers})
            </h4>
          </div>
          <span className="text-xs text-slate-500 font-medium">₹{room.entryFee} entry</span>
        </div>

        <div className="divide-y divide-slate-100">
          {room.players.map((p, idx) => {
            const isMe = p.userId === user.id;
            const chosenTeam = p.guessNumber === 1 ? team1 : team2;
            const isWin = isCompleted && p.guessNumber === winningTeamIndex;

            return (
              <div key={p.id || idx} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                      isMe ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {(p.user?.username || 'U').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900">{p.user?.username || 'Player'}</span>
                      {isMe && (
                        <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                          YOU
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">Seat #{p.seatIndex + 1}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      p.guessNumber === 1
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-purple-50 text-purple-700 border-purple-200'
                    }`}
                  >
                    {chosenTeam.shortName || chosenTeam.name}
                  </span>

                  {isWin && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[11px] font-bold">
                      Winner
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Simulator Test Bar (Developer / Testing Shortcut) */}
      {!isCompleted && !isCancelled && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Developer Test Simulation (Immediate Final Result)</span>
            </div>
            <span className="text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-semibold">
              Instant Settlement
            </span>
          </div>

          <p className="text-xs text-amber-800/80">
            For demonstration or local testing without waiting for match end time, you can simulate which team won:
          </p>

          {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={() => handleSimulate(1, team1.name)}
              disabled={simulating}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
            >
              {simulating ? 'Settling...' : `Simulate ${team1.name} Win`}
            </button>
            <button
              onClick={() => handleSimulate(2, team2.name)}
              disabled={simulating}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
            >
              {simulating ? 'Settling...' : `Simulate ${team2.name} Win`}
            </button>
            <button
              onClick={handleSimulateRefund}
              disabled={simulating}
              className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Simulate Match Abandoned / Refund
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
