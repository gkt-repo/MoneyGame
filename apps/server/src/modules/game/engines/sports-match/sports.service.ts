import https from 'https';
import http from 'http';
import { Server } from 'socket.io';
import { prisma } from '../../../../db';
import { moveWallet } from '../../../../wallet-ledger';
import { serializable } from '../../../../transaction';
import { money, toPaise } from '../../../../money';
import { walletService, getEffectiveCommissionPercent } from '../../../wallet/wallet.service';
import { SportsMatch, SportsTeam, SportsRoomConfig } from '@moneygame/shared-types';

interface CachedData<T> {
  data: T;
  cachedAt: number;
}

export class SportsService {
  private io: Server | null = null;
  private matchesCache: CachedData<SportsMatch[]> | null = null;
  private readonly CACHE_TTL_MS = 45 * 1000; // 45 seconds cache
  private pollInterval: NodeJS.Timeout | null = null;

  setSocketServer(io: Server) {
    this.io = io;
    this.startAutoSync();
  }

  /**
   * Helper to perform HTTP GET request returning parsed JSON
   */
  private fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      const req = client.get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MoneyGame/1.0',
            ...headers,
          },
          timeout: 8000,
        },
        res => {
          let raw = '';
          res.on('data', chunk => (raw += chunk));
          res.on('end', () => {
            try {
              if (res.statusCode && res.statusCode >= 400) {
                return reject(new Error(`API responded with status ${res.statusCode}`));
              }
              const parsed = JSON.parse(raw);
              resolve(parsed);
            } catch (err) {
              reject(err);
            }
          });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout for ${url}`));
      });
      req.on('error', reject);
    });
  }

  /**
   * Marquee featured matches (e.g. today's India vs Australia cricket match requested by user)
   * Guaranteed to always be available even offline or between tournament seasons
   */
  private getFeaturedMatches(): SportsMatch[] {
    return [];
  }

  /**
   * Fetch Live & Upcoming Cricket Matches from ESPN Scoreboard API across upcoming days
   */
  async fetchEspnCricket(): Promise<SportsMatch[]> {
    try {
      const now = new Date();
      const dateQueries: string[] = [];
      // Fetch today and next 7 days of matches
      for (let i = 0; i <= 7; i++) {
        const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dateQueries.push(`${y}${m}${day}`);
      }

      const urls = [
        'https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket',
        ...dateQueries.map(dt => `https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket&dates=${dt}`),
      ];

      const responses = await Promise.all(
        urls.map(u => this.fetchJson(u).catch(() => null))
      );

      const matches: SportsMatch[] = [];
      const seenEventIds = new Set<string>();

      for (const data of responses) {
        if (!data) continue;
        for (const sport of data.sports || []) {
          for (const league of sport.leagues || []) {
            for (const ev of league.events || []) {
              if (seenEventIds.has(ev.id)) continue;
              seenEventIds.add(ev.id);

              const competitors = ev.competitors || [];
              if (competitors.length < 2) continue;

              const t1 = competitors[0];
              const t2 = competitors[1];

              const rawStatus = (ev.status || ev.fullStatus?.type?.state || '').toLowerCase();
              const status =
                rawStatus === 'canc' || rawStatus === 'postponed' || rawStatus === 'abandoned'
                  ? 'CANCELLED'
                  : rawStatus === 'pre'
                  ? 'SCHEDULED'
                  : rawStatus === 'in'
                  ? 'LIVE'
                  : 'FINISHED';

              const team1Name = t1.displayName || t1.name;
              const team2Name = t2.displayName || t2.name;
              const team1Short = t1.abbreviation || t1.shortName || team1Name;
              const team2Short = t2.abbreviation || t2.shortName || team2Name;

              let winnerTeamIndex: number | undefined;
              let winnerName: string | undefined;
              if (t1.winner === true) {
                winnerTeamIndex = 1;
                winnerName = team1Name;
              } else if (t2.winner === true) {
                winnerTeamIndex = 2;
                winnerName = team2Name;
              }

              matches.push({
                id: `espn-cricket-${ev.id}`,
                sport: 'Cricket',
                league: league.name || 'Cricket',
                name: `${team1Name} vs ${team2Name}`,
                shortName: `${team1Short} vs ${team2Short}`,
                startTime: ev.date || new Date().toISOString(),
                status,
                team1: {
                  id: String(t1.id),
                  name: team1Name,
                  shortName: team1Short,
                  logo: t1.logo || 'https://a.espncdn.com/i/teamlogos/cricket/500/default.png',
                  score: t1.score || '',
                  isWinner: t1.winner === true,
                },
                team2: {
                  id: String(t2.id),
                  name: team2Name,
                  shortName: team2Short,
                  logo: t2.logo || 'https://a.espncdn.com/i/teamlogos/cricket/500/default.png',
                  score: t2.score || '',
                  isWinner: t2.winner === true,
                },
                winnerTeamIndex,
                winnerName,
                summary: ev.summary || (status === 'LIVE' ? 'Match Live' : undefined),
              });
            }
          }
        }
      }
      return matches;
    } catch (err: any) {
      console.warn('[SportsService] ESPN Cricket fetch failed:', err?.message || err);
      return [];
    }
  }

  /**
   * Fetch Live & Upcoming Soccer/Football Matches from ESPN Scoreboard API
   */
  async fetchEspnSoccer(): Promise<SportsMatch[]> {
    try {
      const data = await this.fetchJson('https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=soccer');
      const matches: SportsMatch[] = [];

      for (const sport of data.sports || []) {
        for (const league of sport.leagues || []) {
          for (const ev of league.events || []) {
            const competitors = ev.competitors || [];
            if (competitors.length < 2) continue;

            const t1 = competitors[0];
            const t2 = competitors[1];

            const rawStatus = (ev.status || ev.fullStatus?.type?.state || '').toLowerCase();
            const status =
              rawStatus === 'canc' || rawStatus === 'postponed' || rawStatus === 'abandoned'
                ? 'CANCELLED'
                : rawStatus === 'pre'
                ? 'SCHEDULED'
                : rawStatus === 'in'
                ? 'LIVE'
                : 'FINISHED';

            const team1Name = t1.displayName || t1.name;
            const team2Name = t2.displayName || t2.name;

            let winnerTeamIndex: number | undefined;
            let winnerName: string | undefined;
            if (t1.winner === true) {
              winnerTeamIndex = 1;
              winnerName = team1Name;
            } else if (t2.winner === true) {
              winnerTeamIndex = 2;
              winnerName = team2Name;
            }

            matches.push({
              id: `espn-soccer-${ev.id}`,
              sport: 'Football',
              league: league.name || 'Soccer',
              name: ev.name || `${team1Name} vs ${team2Name}`,
              shortName: ev.shortName,
              startTime: ev.date || new Date().toISOString(),
              status,
              team1: {
                id: String(t1.id),
                name: team1Name,
                shortName: t1.abbreviation || t1.shortName || t1.name,
                logo: t1.logo || 'https://a.espncdn.com/i/teamlogos/soccer/500/default.png',
                score: t1.score || '',
                isWinner: t1.winner === true,
              },
              team2: {
                id: String(t2.id),
                name: team2Name,
                shortName: t2.abbreviation || t2.shortName || t2.name,
                logo: t2.logo || 'https://a.espncdn.com/i/teamlogos/soccer/500/default.png',
                score: t2.score || '',
                isWinner: t2.winner === true,
              },
              winnerTeamIndex,
              winnerName,
              summary: ev.summary,
            });
          }
        }
      }
      return matches;
    } catch (err: any) {
      console.warn('[SportsService] ESPN Soccer fetch failed:', err?.message || err);
      return [];
    }
  }

  /**
   * Fetch from CricketData.org / CricAPI if API key is provided
   */
  async fetchCricketDataOrg(): Promise<SportsMatch[]> {
    const apiKey = process.env.CRICKET_API_KEY || process.env.CRICAPI_KEY;
    if (!apiKey) return [];

    try {
      const data = await this.fetchJson(`https://api.cricapi.com/v1/matches?apikey=${apiKey}&offset=0`);
      if (!data?.data || !Array.isArray(data.data)) return [];

      const matches: SportsMatch[] = [];
      for (const item of data.data) {
        if (!item.teamInfo || item.teamInfo.length < 2) continue;

        const t1 = item.teamInfo[0];
        const t2 = item.teamInfo[1];
        const isEnded = item.matchEnded === true;
        const status = isEnded ? 'FINISHED' : item.matchStarted ? 'LIVE' : 'SCHEDULED';

        let winnerTeamIndex: number | undefined;
        let winnerName: string | undefined;
        if (item.matchWinner) {
          if (item.matchWinner.toLowerCase().includes(t1.name.toLowerCase())) {
            winnerTeamIndex = 1;
            winnerName = t1.name;
          } else if (item.matchWinner.toLowerCase().includes(t2.name.toLowerCase())) {
            winnerTeamIndex = 2;
            winnerName = t2.name;
          }
        }

        matches.push({
          id: `cricapi-${item.id}`,
          sport: 'Cricket',
          league: item.matchType ? item.matchType.toUpperCase() : 'Cricket',
          name: item.name || `${t1.name} vs ${t2.name}`,
          shortName: `${t1.shortname || t1.name} vs ${t2.shortname || t2.name}`,
          startTime: item.dateTimeGMT ? new Date(item.dateTimeGMT).toISOString() : new Date().toISOString(),
          status,
          team1: {
            name: t1.name,
            shortName: t1.shortname,
            logo: t1.img,
          },
          team2: {
            name: t2.name,
            shortName: t2.shortname,
            logo: t2.img,
          },
          winnerTeamIndex,
          winnerName,
          summary: item.status,
        });
      }
      return matches;
    } catch (err: any) {
      console.warn('[SportsService] CricketData.org API fetch failed:', err?.message || err);
      return [];
    }
  }

  /**
   * Fetch Live & Upcoming Basketball / NBA Matches from ESPN Scoreboard API
   */
  async fetchEspnBasketball(): Promise<SportsMatch[]> {
    try {
      const data = await this.fetchJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
      const matches: SportsMatch[] = [];

      for (const ev of data.events || []) {
        const comp = ev.competitions?.[0];
        if (!comp) continue;
        const competitors = comp.competitors || [];
        if (competitors.length < 2) continue;

        const home = competitors.find((c: any) => c.homeAway === 'home') || competitors[0];
        const away = competitors.find((c: any) => c.homeAway === 'away') || competitors[1];

        const t1 = away; // Away
        const t2 = home; // Home

        const rawStatus = (ev.status?.type?.state || '').toLowerCase();
        const status =
          rawStatus === 'canc' || rawStatus === 'postponed'
            ? 'CANCELLED'
            : rawStatus === 'pre'
            ? 'SCHEDULED'
            : rawStatus === 'in'
            ? 'LIVE'
            : 'FINISHED';

        const t1Team = t1.team || {};
        const t2Team = t2.team || {};
        const team1Name = t1Team.displayName || t1Team.name || 'Away Team';
        const team2Name = t2Team.displayName || t2Team.name || 'Home Team';

        let winnerTeamIndex: number | undefined;
        let winnerName: string | undefined;
        if (t1.winner === true) {
          winnerTeamIndex = 1;
          winnerName = team1Name;
        } else if (t2.winner === true) {
          winnerTeamIndex = 2;
          winnerName = team2Name;
        }

        matches.push({
          id: `espn-nba-${ev.id}`,
          sport: 'Basketball',
          league: 'NBA',
          name: `${team1Name} vs ${team2Name}`,
          shortName: `${t1Team.abbreviation || 'AWAY'} vs ${t2Team.abbreviation || 'HOME'}`,
          startTime: ev.date || new Date().toISOString(),
          status,
          team1: {
            id: String(t1Team.id),
            name: team1Name,
            shortName: t1Team.abbreviation || team1Name,
            logo: t1Team.logo || 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/default.png',
            score: t1.score || '',
            isWinner: t1.winner === true,
          },
          team2: {
            id: String(t2Team.id),
            name: team2Name,
            shortName: t2Team.abbreviation || team2Name,
            logo: t2Team.logo || 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/default.png',
            score: t2.score || '',
            isWinner: t2.winner === true,
          },
          winnerTeamIndex,
          winnerName,
          summary: ev.status?.type?.detail || (status === 'LIVE' ? 'Live in Progress' : undefined),
        });
      }
      return matches;
    } catch (err: any) {
      console.warn('[SportsService] ESPN Basketball fetch failed:', err?.message || err);
      return [];
    }
  }

  /**
   * Fetch all live and upcoming matches with caching
   */
  async getAllMatches(sport?: string): Promise<SportsMatch[]> {
    const now = Date.now();
    if (this.matchesCache && now - this.matchesCache.cachedAt < this.CACHE_TTL_MS) {
      const cached = this.matchesCache.data;
      if (!sport || sport.toLowerCase() === 'all') return cached;
      return cached.filter(m => m.sport.toLowerCase() === sport.toLowerCase());
    }

    const [espnCricket, espnSoccer, espnBasketball, cricApi] = await Promise.all([
      this.fetchEspnCricket(),
      this.fetchEspnSoccer(),
      this.fetchEspnBasketball(),
      this.fetchCricketDataOrg(),
    ]);

    // Combine live API feeds only (all mock examples removed - only real matches returned)
    const liveFeeds = [...cricApi, ...espnCricket, ...espnSoccer, ...espnBasketball];
    const combined = [...liveFeeds];

    const seen = new Set<string>();
    const uniqueMatches: SportsMatch[] = [];

    for (const m of combined) {
      const key = m.id || `${m.sport}:${m.name}:${m.startTime}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueMatches.push(m);
      }
    }

    // Sort order:
    // 1. LIVE matches first
    // 2. Upcoming SCHEDULED matches ordered chronologically (soonest first)
    // 3. Finished / Cancelled fixtures last
    uniqueMatches.sort((a, b) => {
      const aLive = a.status === 'LIVE';
      const bLive = b.status === 'LIVE';
      if (aLive && !bLive) return -1;
      if (!aLive && bLive) return 1;

      const aSched = a.status === 'SCHEDULED';
      const bSched = b.status === 'SCHEDULED';
      if (aSched && !bSched) return -1;
      if (!aSched && bSched) return 1;

      const tA = new Date(a.startTime).getTime();
      const tB = new Date(b.startTime).getTime();
      return tA - tB;
    });

    this.matchesCache = {
      data: uniqueMatches,
      cachedAt: now,
    };

    if (!sport || sport.toLowerCase() === 'all') return uniqueMatches;
    return uniqueMatches.filter(m => m.sport.toLowerCase() === sport.toLowerCase());
  }

  /**
   * Find a specific match by ID
   */
  async getMatchById(matchId: string): Promise<SportsMatch | null> {
    const matches = await this.getAllMatches();
    return matches.find(m => m.id === matchId) || null;
  }

  /**
   * Background Auto-Sync:
   * 1. Locks rooms whose match start time has arrived (status -> PLAYING)
   * 2. Checks live status for finished matches and triggers atomic payout settlement
   */
  async checkAndSyncRooms() {
    try {
      const activeRooms = await prisma.room.findMany({
        where: {
          gameType: 'SPORTS_MATCH',
          status: { in: ['WAITING', 'PLAYING'] },
        },
        include: {
          players: true,
        },
      });

      if (activeRooms.length === 0) return;

      const now = new Date();
      const allMatches = await this.getAllMatches();
      const matchMap = new Map(allMatches.map(m => [m.id, m]));

      for (const room of activeRooms) {
        let config: SportsRoomConfig | null = null;
        try {
          if (room.customConfig) config = JSON.parse(room.customConfig);
        } catch (_) {}

        if (!config || !config.startTime) continue;

        const startTime = new Date(config.startTime);
        const match = matchMap.get(config.matchId);

        // 1. Check for Room Lock (Match started)
        if (room.status === 'WAITING') {
          const matchIsLive = match && (match.status === 'LIVE' || match.status === 'FINISHED');
          if (now >= startTime || matchIsLive) {
            // Lock room: transition to PLAYING so no more entries can join
            await prisma.room.update({
              where: { id: room.id },
              data: { status: 'PLAYING' },
            });
            console.log(`[SportsService] Room #${room.roomCode} locked (match has started).`);
            this.io?.to(`room:${room.id}`).emit('room_updated', await this.getRoomDetails(room.id));
            if (this.io) {
              const { gameManager } = await import('../../game.manager');
              void gameManager.broadcastLobbyUpdate();
            }
          }
        }

        // 2. Check for Match Completion or Cancellation
        if (match) {
          if (match.status === 'CANCELLED') {
            console.log(`[SportsService] Match ${match.name} cancelled/abandoned! Refunding room #${room.roomCode}`);
            await this.settleSportsPool(room.id, 999, 'Match Cancelled');
          } else if (match.status === 'FINISHED') {
            if (match.winnerTeamIndex !== undefined && match.winnerTeamIndex > 0) {
              console.log(`[SportsService] Match ${match.name} finished! Winner: ${match.winnerName || 'Team ' + match.winnerTeamIndex}`);
              await this.settleSportsPool(room.id, match.winnerTeamIndex, match.winnerName);
            } else {
              // Match ended with no decisive winner (e.g. Draw / Tie / No Result) -> Refund all
              console.log(`[SportsService] Match ${match.name} finished with no winner/draw. Refunding room #${room.roomCode}`);
              await this.settleSportsPool(room.id, 999, 'Match Draw / No Result');
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[SportsService] Error in checkAndSyncRooms:', err?.message || err);
    }
  }

  /**
   * Helper to fetch full room info with player details
   */
  private async getRoomDetails(roomId: string) {
    const { gameManager } = await import('../../game.manager');
    return gameManager.getRoomDetails(roomId);
  }

  /**
   * Start polling timer for periodic match check and room locking
   */
  startAutoSync() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      void this.checkAndSyncRooms();
    }, 30 * 1000); // Check every 30 seconds
  }

  stopAutoSync() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Atomic Settlement of Sports Match Pool:
   * Multi-winner distribution according to user requirements:
   * Pot = total entry fees
   * If N players picked the winning team, each winner receives Pot / N
   * If 0 players picked the winning team or match cancelled: 100% refund
   */
  async settleSportsPool(
    roomId: string,
    winningTeamIndex: number,
    winningTeamName?: string
  ) {
    const settlementResult = await serializable(async tx => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: {
          players: {
            include: { user: { select: { id: true, username: true } } },
          },
        },
      });

      if (!room) throw new Error('Room not found');
      if (room.status !== 'WAITING' && room.status !== 'PLAYING') {
        return { settled: false, reason: 'Room is already settled or cancelled', room };
      }

      const players = room.players;
      const entryFee = room.entryFee;
      const entryFeePaise = toPaise(entryFee);
      const totalPoolPaise = entryFeePaise * players.length;
      const totalPool = totalPoolPaise / 100;

      let customConfigObj: SportsRoomConfig & Record<string, any> = {
        matchId: '',
        sport: 'Cricket',
        league: '',
        matchTitle: '',
        startTime: new Date().toISOString(),
        team1: { name: 'Team 1' },
        team2: { name: 'Team 2' },
      };
      try {
        if (room.customConfig) customConfigObj = JSON.parse(room.customConfig);
      } catch (_) {}

      // Case 1: Room had 0 or 1 player -> Refund single player
      if (players.length <= 1) {
        for (const player of players) {
          await moveWallet(tx, player.userId, entryFee, -entryFee);
          await tx.transaction.create({
            data: {
              userId: player.userId,
              amount: entryFee,
              type: 'REFUND',
              referenceId: room.id,
              idempotencyKey: `sports-refund:${room.id}:${player.userId}`,
              description: `Match pool cancelled (insufficient participants) for Room #${room.roomCode}`,
            },
          });
        }
        await tx.room.update({
          where: { id: roomId },
          data: { status: 'CANCELLED' },
        });
        return { settled: true, refunded: true, winnersCount: 0, room };
      }

      // Case 2: Players who chose the winning team
      // guessNumber stores team index (1 = Team 1, 2 = Team 2)
      const winners = players.filter(p => p.guessNumber === winningTeamIndex);
      const losers = players.filter(p => p.guessNumber !== winningTeamIndex);

      // If nobody picked the winning team (or match cancelled / draw without winner)
      if (winners.length === 0) {
        for (const player of players) {
          await moveWallet(tx, player.userId, entryFee, -entryFee);
          await tx.transaction.create({
            data: {
              userId: player.userId,
              amount: entryFee,
              type: 'REFUND',
              referenceId: room.id,
              idempotencyKey: `sports-refund:${room.id}:${player.userId}`,
              description: `Sports pool refunded for Room #${room.roomCode} (No participants picked ${winningTeamName || 'winning outcome'})`,
            },
          });
        }
        customConfigObj.settlement = {
          status: 'REFUNDED',
          reason: 'NO_WINNERS',
          totalPot: totalPool,
          winningTeamIndex,
          winningTeamName: winningTeamName || '',
          settledAt: new Date().toISOString(),
        };
        await tx.room.update({
          where: { id: roomId },
          data: {
            status: 'CANCELLED',
            customConfig: JSON.stringify(customConfigObj),
          },
        });
        return { settled: true, refunded: true, winnersCount: 0, room };
      }

      // Case 3: We have winners!
      // Commission deduction if configured (0% by default)
      const commissionPercent = await getEffectiveCommissionPercent();
      const commissionPaise = Math.round((totalPoolPaise * commissionPercent) / 100);
      const distributablePoolPaise = totalPoolPaise - commissionPaise;
      const payoutPerWinnerPaise = Math.floor(distributablePoolPaise / winners.length);
      const payoutPerWinner = payoutPerWinnerPaise / 100;
      const totalWinnerPrize = (payoutPerWinnerPaise * winners.length) / 100;

      // Credit each winner:
      // Available balance increases by payoutPerWinner
      // Locked balance decreases by entryFee
      for (const winner of winners) {
        await moveWallet(tx, winner.userId, payoutPerWinner, -entryFee);
        await tx.transaction.create({
          data: {
            userId: winner.userId,
            amount: payoutPerWinner,
            type: 'ROOM_WIN',
            referenceId: room.id,
            idempotencyKey: `sports-win:${room.id}:${winner.userId}`,
            description: `Won Sports Pool for ${customConfigObj.matchTitle || room.roomCode} (${winningTeamName || 'Team ' + winningTeamIndex})`,
          },
        });
      }

      // Losers: locked balance is cleared
      for (const loser of losers) {
        await moveWallet(tx, loser.userId, 0, -entryFee);
      }

      customConfigObj.settlement = {
        status: 'SETTLED',
        totalPot: totalPool,
        distributablePool: distributablePoolPaise / 100,
        commissionAmount: commissionPaise / 100,
        winningTeamIndex,
        winningTeamName: winningTeamName || '',
        winnersCount: winners.length,
        losersCount: losers.length,
        payoutPerWinner,
        winnerUserIds: winners.map(w => w.userId),
        settledAt: new Date().toISOString(),
      };

      const updated = await tx.room.update({
        where: { id: roomId },
        data: {
          status: 'COMPLETED',
          winningNumber: winningTeamIndex,
          winnerId: winners[0].userId,
          winnerPrize: totalWinnerPrize,
          customConfig: JSON.stringify(customConfigObj),
        },
        include: {
          players: { include: { user: { select: { id: true, username: true } } } },
          winner: { select: { id: true, username: true } },
        },
      });

      return {
        settled: true,
        refunded: false,
        winners,
        losers,
        payoutPerWinner,
        totalWinnerPrize,
        room: updated,
      };
    });

    if (settlementResult.settled && this.io) {
      const room = settlementResult.room;
      const updatedDetails = await this.getRoomDetails(roomId);

      this.io.to(`room:${roomId}`).emit('game_finished', {
        roomId,
        winningNumber: winningTeamIndex,
        winningTeamName,
        winnersCount: settlementResult.winners?.length || 0,
        payoutPerWinner: settlementResult.payoutPerWinner,
        totalPrize: settlementResult.totalWinnerPrize,
        refunded: settlementResult.refunded,
        room: updatedDetails,
      });

      this.io.to(`room:${roomId}`).emit('room_updated', updatedDetails);

      // Refresh wallet for all players
      for (const p of room.players) {
        const wallet = await walletService.getWallet(p.userId);
        this.io.to(`user:${p.userId}`).emit('balance_updated', wallet);
        this.io.to(`user:${p.userId}`).emit('wallet_updated', wallet);
      }

      const { gameManager } = await import('../../game.manager');
      void gameManager.broadcastLobbyUpdate();
    }

    return settlementResult;
  }
}

export const sportsService = new SportsService();
