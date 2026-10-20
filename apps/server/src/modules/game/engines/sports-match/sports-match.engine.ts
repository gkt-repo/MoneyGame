import { Server } from 'socket.io';
import { GameDescriptor, GameType, SportsRoomConfig } from '@moneygame/shared-types';
import { IGameEngine, RoomWithPlayers, ActionResult } from '../../engine.interface';
import { prisma } from '../../../../db';
import { sportsService } from './sports.service';

export class SportsMatchEngine implements IGameEngine {
  readonly gameType: GameType = 'SPORTS_MATCH';

  readonly descriptor: GameDescriptor = {
    id: 'SPORTS_MATCH',
    name: 'Live Sports Pool',
    tagline: 'Predict live match winners & take the pot!',
    description: 'Cricket, Football & more. Back your team in 2, 4, 6, 10 or unlimited player rooms!',
    minPlayers: 2,
    maxPlayers: 1000,
    defaultEntryFees: [10, 20, 50, 100, 200, 500, 1000],
    icon: '🏏',
    enabled: true,
  };

  /**
   * Validate options when creating a sports pool room
   */
  validateCreateOptions(options: {
    entryFee: number;
    maxPlayers: number;
    guessNumber?: number;
    customConfig?: Record<string, any>;
  }): void {
    const { entryFee, maxPlayers, guessNumber, customConfig } = options;

    if (!Number.isFinite(entryFee) || entryFee <= 0) {
      throw new Error('Entry fee must be greater than zero');
    }

    // Supported player capacities: 2, 4, 6, 10, or unlimited (>= 100)
    const validCapacities = [2, 4, 6, 10];
    const isUnlimited = maxPlayers >= 100;
    if (!validCapacities.includes(maxPlayers) && !isUnlimited) {
      throw new Error(`Invalid capacity: ${maxPlayers}. Supported options are 2, 4, 6, 10, or Unlimited.`);
    }

    // guessNumber must be 1 (Team 1) or 2 (Team 2) or 0 (Draw)
    if (guessNumber === undefined || guessNumber === null || ![0, 1, 2].includes(guessNumber)) {
      throw new Error('Please select which team you predict to win (1 for Team 1, 2 for Team 2).');
    }

    if (!customConfig || !customConfig.matchId || !customConfig.team1 || !customConfig.team2) {
      throw new Error('Match details and teams must be specified.');
    }

    // Match start time verification
    if (customConfig.startTime) {
      const startTime = new Date(customConfig.startTime);
      if (isNaN(startTime.getTime())) {
        throw new Error('Invalid match start time format.');
      }
      if (new Date() >= startTime) {
        throw new Error('This match has already started! Room creation is closed for live matches.');
      }
    }
  }

  /**
   * Validate parameters when a player joins the sports pool room
   */
  validateJoin(
    room: RoomWithPlayers,
    userId: string,
    joinData?: { guessNumber?: number; seatIndex?: number }
  ): void {
    if (room.status !== 'WAITING') {
      throw new Error('This room is already locked or in progress.');
    }

    // Check if player is already in room
    if (room.players.some(p => p.userId === userId)) {
      throw new Error('You have already joined this room.');
    }

    // Check capacity limit
    if (room.players.length >= room.maxPlayers) {
      throw new Error('This room has reached maximum player capacity.');
    }

    // Check guessNumber (team selection)
    const teamIndex = joinData?.guessNumber;
    if (teamIndex === undefined || teamIndex === null || ![0, 1, 2].includes(teamIndex)) {
      throw new Error('Please select which team you predict to win (1 for Team 1, 2 for Team 2).');
    }

    // Check if match start time has passed
    if (room.customConfig) {
      let config: any = null;
      try {
        config = typeof room.customConfig === 'string' ? JSON.parse(room.customConfig) : room.customConfig;
      } catch (_) {}
      if (config && config.startTime && new Date() >= new Date(config.startTime)) {
        throw new Error('This match has already started! Room is locked and entries are closed.');
      }
    }
  }

  /**
   * Hook called immediately when a player joins the room
   */
  async onPlayerJoined(room: RoomWithPlayers, userId: string, io: Server | null): Promise<void> {
    try {
      // Fetch fresh room record directly from DB to preserve true customConfig
      const dbRoom = await prisma.room.findUnique({
        where: { id: room.id },
        select: { customConfig: true, maxPlayers: true, roomCode: true },
      });

      let config: Record<string, any> = {};
      const rawCfg = dbRoom?.customConfig ?? room.customConfig;
      if (rawCfg) {
        if (typeof rawCfg === 'object') {
          config = { ...(rawCfg as Record<string, any>) };
        } else if (typeof rawCfg === 'string') {
          try {
            config = JSON.parse(rawCfg);
          } catch (_) {}
        }
      }

      if (!config.predictions) config.predictions = {};

      const player = room.players.find(p => p.userId === userId);
      if (player && player.guessNumber !== null && player.guessNumber !== undefined) {
        const chosenTeamName =
          player.guessNumber === 1
            ? config.team1?.name || 'Team 1'
            : player.guessNumber === 2
            ? config.team2?.name || 'Team 2'
            : 'Draw';

        config.predictions[userId] = {
          userId,
          username: player.user?.username || 'Player',
          teamIndex: player.guessNumber,
          teamName: chosenTeamName,
          selectedAt: new Date().toISOString(),
        };

        // Persist updated prediction in customConfig without destroying match details
        await prisma.room.update({
          where: { id: room.id },
          data: { customConfig: JSON.stringify(config) },
        });
      }

      // If room capacity reached, lock the room
      const maxCap = dbRoom?.maxPlayers ?? room.maxPlayers;
      if (room.players.length >= maxCap) {
        await prisma.room.update({
          where: { id: room.id },
          data: { status: 'PLAYING' },
        });
        console.log(`[SportsMatchEngine] Room #${room.roomCode} is now full (${room.players.length}/${maxCap}). Room locked.`);
      }

      const { gameManager } = await import('../../game.manager');
      const details = await gameManager.getRoomDetails(room.id);
      io?.to(`room:${room.id}`).emit('room_updated', details);
    } catch (err: any) {
      console.error('[SportsMatchEngine] onPlayerJoined error:', err?.message || err);
    }
  }

  /**
   * Lifecycle hook when game starts
   */
  async startGame(roomId: string, io: Server | null): Promise<void> {
    await prisma.room.update({
      where: { id: roomId },
      data: { status: 'PLAYING' },
    });
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { players: { include: { user: true } } },
    });
    io?.to(`room:${roomId}`).emit('room_updated', room);
  }

  /**
   * Handle in-game action (sports match pool actions are handled via system settlement)
   */
  async handleAction(
    _roomId: string,
    _userId: string,
    action: string,
    _payload: any,
    _io: Server | null
  ): Promise<ActionResult> {
    return { success: false, message: `Unsupported sports action: ${action}` };
  }

  /**
   * Return client-safe game state including pool odds, team picker counts, and live scores
   */
  getClientState(roomId: string, userId?: string): any {
    // Basic state computed on read
    return {
      roomId,
      requestedBy: userId,
    };
  }

  /**
   * Clean up in-memory timers / state when room finishes or is cancelled
   */
  cleanupRoom(_roomId: string): void {
    // No per-room timers required; managed by sportsService
  }
}

export const sportsMatchEngine = new SportsMatchEngine();
