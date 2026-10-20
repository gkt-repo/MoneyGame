import crypto from 'crypto';
import { moveWallet } from '../../wallet-ledger';
import { Server } from 'socket.io';
import { serializable } from '../../transaction';
import { money, toPaise } from '../../money';
import { prisma } from '../../db';
import { walletService } from '../wallet/wallet.service';
import { gameRegistry } from './game.registry';
import { RoomWithPlayers } from './engine.interface';

export class GameManager {
  private io: Server | null = null;

  setSocketServer(io: Server) {
    this.io = io;
  }

  /**
   * Create a new game room
   */
  async createRoom(
    hostUserId: string,
    amount: number,
    maxPlayers: number,
    guessNumber?: number | null,
    gameType: string = 'GUESS_NUMBER',
    customConfig?: Record<string, any>
  ) {
    const entryFee = money(amount, 1);
    if (!gameRegistry.has(gameType)) {
      throw new Error(`Unsupported game type: ${gameType}`);
    }
    const engine = gameRegistry.get(gameType);
    if (engine.descriptor.enabled === false) {
      throw new Error(`${engine.descriptor.name} is currently disabled`);
    }

    engine.validateCreateOptions({
      entryFee,
      maxPlayers,
      guessNumber: guessNumber ?? undefined,
      customConfig,
    });

    let sanitizedConfig: Record<string, any> | null = null;
    if (customConfig && typeof customConfig === 'object') {
      const { playerStakes, settledPool, platformCommission, ...rest } = customConfig;
      if (Object.keys(rest).length > 0) {
        sanitizedConfig = rest;
      }
    }

    const room = await serializable(async tx => {
      const created = await tx.room.create({
        data: {
          roomCode: 'R-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
          gameType,
          entryFee,
          maxPlayers,
          customConfig: sanitizedConfig ? JSON.stringify(sanitizedConfig) : null,
        },
      });

      await walletService.lockRoomEntry(
        tx,
        hostUserId,
        created.id,
        entryFee,
        guessNumber ?? null,
        0, // Host gets seat 0
        gameType === 'TEEN_PATTI'
      );

      return created;
    });

    await this.broadcastLobbyUpdate();
    return this.getRoomDetails(room.id, hostUserId);
  }

  /**
   * Join an existing game room
   */
  async joinRoom(
    userId: string,
    roomCode: string,
    guessNumber?: number | null,
    seatIndex?: number
  ) {
    if (typeof roomCode !== 'string') throw new Error('Room code is required');
    roomCode = roomCode.trim().toUpperCase();

    // Pre-check room and engine validation before transaction
    const initialRoom = await prisma.room.findUnique({
      where: { roomCode },
      include: {
        players: {
          include: { user: { select: { id: true, username: true } } },
          orderBy: { seatIndex: 'asc' },
        },
      },
    });

    if (!initialRoom) throw new Error('Room not found');

    if (!gameRegistry.has(initialRoom.gameType)) {
      throw new Error(`Unsupported game type: ${initialRoom.gameType}`);
    }
    const engine = gameRegistry.get(initialRoom.gameType);
    if (engine.descriptor.enabled === false) {
      throw new Error(`${engine.descriptor.name} is currently disabled`);
    }

    engine.validateJoin(initialRoom as unknown as RoomWithPlayers, userId, {
      guessNumber: guessNumber ?? undefined,
      seatIndex,
    });

    const result = await serializable(async tx => {
      // Write-lock room to prevent concurrent overfill
      const locked = await tx.room.updateMany({
        where: { roomCode, status: 'WAITING' },
        data: { status: 'WAITING' },
      });
      if (locked.count !== 1) throw new Error('Room is not available to join');

      const room = await tx.room.findUniqueOrThrow({
        where: { roomCode },
        include: { players: true },
      });

      if (room.players.length >= room.maxPlayers) throw new Error('Room is already full');

      await walletService.lockRoomEntry(
        tx,
        userId,
        room.id,
        room.entryFee,
        guessNumber ?? null,
        seatIndex,
        room.gameType === 'TEEN_PATTI'
      );

      const full = room.players.length + 1 === room.maxPlayers;
      if (full) {
        const nextStatus = room.gameType === 'GUESS_NUMBER' ? 'COUNTDOWN' : 'PLAYING';
        await tx.room.update({ where: { id: room.id }, data: { status: nextStatus } });
      }

      return { id: room.id, gameType: room.gameType, full };
    });

    const updatedRoom = await this.getRoomDetails(result.id, userId);

    // Trigger engine hooks if table is full or for ongoing sports pool tracking
    if (result.full) {
      if (result.gameType === 'GUESS_NUMBER') {
        const legacyEngine = gameRegistry.get('GUESS_NUMBER');
        void legacyEngine.startGame(result.id, this.io);
      } else {
        await engine.onPlayerJoined(updatedRoom as unknown as RoomWithPlayers, userId, this.io);
      }
    } else if (result.gameType === 'SPORTS_MATCH') {
      await engine.onPlayerJoined(updatedRoom as unknown as RoomWithPlayers, userId, this.io);
    }

    this.io?.to(`room:${result.id}`).emit('room_updated', updatedRoom);
    await this.broadcastLobbyUpdate();
    return updatedRoom;
  }

  /**
   * Handle real-time in-game player action
   */
  async handlePlayerAction(roomId: string, userId: string, action: string, payload: any) {
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { gameType: true } });
    if (!room) throw new Error('Room not found');

    const engine = gameRegistry.get(room.gameType);
    return engine.handleAction(roomId, userId, action, payload, this.io);
  }

  stopTimers() {
    for (const desc of gameRegistry.listGames()) {
      const engine = gameRegistry.get(desc.id);
      if ('stopAllTimers' in engine && typeof (engine as any).stopAllTimers === 'function') {
        (engine as any).stopAllTimers();
      }
    }
  }

  async cancelWaitingRoom(roomId: string, userId: string) {
    return this.refundRoom(roomId, userId);
  }

  private async refundRoom(roomId: string, userId?: string) {
    const players = await serializable(async tx => {
      const room = await tx.room.findUnique({ where: { id: roomId }, include: { players: true } });
      if (!room) throw new Error('Room not found');
      if (userId && !room.players.some(p => p.userId === userId)) throw new Error('Only participants can cancel a room');
      if (userId && room.status !== 'WAITING') throw new Error('Only waiting rooms can be cancelled');
      if (userId && room.gameType === 'SPORTS_MATCH') {
        const isHost = room.players[0]?.userId === userId;
        if (!isHost) throw new Error('Only the room creator can cancel this pool');
        if (room.players.length > 1) {
          throw new Error('Cannot cancel pool once other players have joined');
        }
      }
      if (!['WAITING', 'COUNTDOWN', 'ROLLING', 'PLAYING'].includes(room.status)) return [];

      await tx.room.update({ where: { id: roomId }, data: { status: 'CANCELLED' } });

      let configObj: Record<string, any> = {};
      try {
        if (room.customConfig) configObj = JSON.parse(room.customConfig);
      } catch (_) {}
      const playerStakes = configObj.playerStakes || {};

      for (const player of room.players) {
        const inGameStake = room.status !== 'WAITING' && typeof playerStakes[player.userId] === 'number'
          ? playerStakes[player.userId]
          : 0;
        const totalRefund = (toPaise(room.entryFee) + toPaise(inGameStake)) / 100;

        await moveWallet(tx, player.userId, totalRefund, -totalRefund);

        const entryTx = await tx.transaction.findFirst({
          where: { userId: player.userId, referenceId: roomId, type: 'ROOM_ENTRY' },
        });
        if (entryTx) {
          await tx.transaction.create({
            data: {
              userId: player.userId,
              amount: totalRefund,
              type: 'REFUND',
              referenceId: roomId,
              idempotencyKey: `room-refund:${roomId}:${player.userId}`,
              description: `Cancelled game entry and stakes refunded for Room #${room.roomCode}`,
            },
          });
        }
      }
      return room.players;
    });

    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { gameType: true } });
    if (room) {
      const engine = gameRegistry.get(room.gameType);
      engine.cleanupRoom(roomId);
    }

    for (const player of players) {
      this.io?.to(`user:${player.userId}`).emit('balance_updated', await walletService.getWallet(player.userId));
    }

    this.io?.to(`room:${roomId}`).emit('room_updated', await this.getRoomDetails(roomId));
    await this.broadcastLobbyUpdate();
  }

  async recoverInterruptedRooms() {
    const rooms = await prisma.room.findMany({
      where: {
        status: { in: ['WAITING', 'COUNTDOWN', 'ROLLING', 'PLAYING'] },
        gameType: { not: 'SPORTS_MATCH' },
      },
      select: { id: true },
    });
    for (const room of rooms) {
      try {
        await this.refundRoom(room.id);
      } catch (err: any) {
        console.error(`[Recovery] Failed to recover room ${room.id}:`, err?.message || err);
      }
    }
  }

  /**
   * Helper to fetch full room info with player details and sanitized game state
   */
  async getRoomDetails(roomId: string, forUserId?: string) {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        players: {
          include: {
            user: { select: { id: true, username: true } },
          },
          orderBy: { seatIndex: 'asc' },
        },
        winner: {
          select: { id: true, username: true },
        },
      },
    });

    if (!room) return null;

    const engine = gameRegistry.get(room.gameType);
    const gameState = engine ? engine.getClientState(roomId, forUserId) : null;
    let parsedConfig: Record<string, any> | null = null;
    try {
      if (room.customConfig) parsedConfig = JSON.parse(room.customConfig);
    } catch (_) {}

    return {
      ...room,
      customConfig: parsedConfig,
      gameState,
    };
  }

  /**
   * Helper to fetch full room info by room code
   */
  async getRoomByCode(roomCode: string, forUserId?: string) {
    if (typeof roomCode !== 'string') return null;
    const room = await prisma.room.findUnique({
      where: { roomCode: roomCode.trim().toUpperCase() },
      include: {
        players: {
          include: {
            user: { select: { id: true, username: true } },
          },
          orderBy: { seatIndex: 'asc' },
        },
        winner: {
          select: { id: true, username: true },
        },
      },
    });

    if (!room) return null;

    const engine = gameRegistry.get(room.gameType);
    const gameState = engine ? engine.getClientState(room.id, forUserId) : null;
    let parsedConfig: Record<string, any> | null = null;
    try {
      if (room.customConfig) parsedConfig = JSON.parse(room.customConfig);
    } catch (_) {}

    return {
      ...room,
      customConfig: parsedConfig,
      gameState,
    };
  }

  /**
   * Fetch all open/active rooms for the lobby
   */
  async getActiveRooms() {
    const rooms = await prisma.room.findMany({
      where: {
        status: { in: ['WAITING', 'COUNTDOWN', 'ROLLING', 'PLAYING'] },
      },
      include: {
        players: {
          include: {
            user: { select: { id: true, username: true } },
          },
          orderBy: { seatIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return rooms.map(room => {
      let parsedConfig: Record<string, any> | null = null;
      try {
        if (room.customConfig) parsedConfig = JSON.parse(room.customConfig);
      } catch (_) {}
      return {
        ...room,
        customConfig: parsedConfig,
      };
    });
  }

  /**
   * Broadcast lobby room updates
   */
  async broadcastLobbyUpdate() {
    if (this.io) {
      const rooms = await this.getActiveRooms();
      this.io.emit('lobby_rooms_updated', rooms);
    }
  }
}

export const gameManager = new GameManager();
