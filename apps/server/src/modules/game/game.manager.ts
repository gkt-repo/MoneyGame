import crypto from 'crypto';
import { moveWallet } from '../../wallet-ledger';
import { Server } from 'socket.io';
import { serializable } from '../../transaction';
import { money } from '../../money';
import { prisma } from '../../db';
import { config } from '../../config';
import { walletService } from '../wallet/wallet.service';

export class GameManager {
  private io: Server | null = null;

  setSocketServer(io: Server) {
    this.io = io;
  }

  private timers = new Map<string, ReturnType<typeof setInterval>>();

  private validateGuess(guess: number) {
    if (!Number.isInteger(guess) || guess < 1 || guess > 10) throw new Error('Guess must be an integer between 1 and 10');
  }

  async createRoom(hostUserId: string, amount: number, maxPlayers: number, guessNumber: number) {
    const entryFee = money(amount, 1);
    this.validateGuess(guessNumber);
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) throw new Error('Max players must be between 2 and 10');
    const room = await serializable(async tx => {
      const created = await tx.room.create({ data: {
        roomCode: 'R-' + crypto.randomBytes(4).toString('hex').toUpperCase(), entryFee, maxPlayers,
      } });
      await walletService.lockRoomEntry(tx, hostUserId, created.id, entryFee, guessNumber);
      return created;
    });
    await this.broadcastLobbyUpdate();
    return this.getRoomDetails(room.id);
  }

  async joinRoom(userId: string, roomCode: string, guessNumber: number) {
    this.validateGuess(guessNumber);
    if (typeof roomCode !== 'string') throw new Error('Room code is required');
    roomCode = roomCode.trim().toUpperCase();
    const result = await serializable(async tx => {
      // Write-lock the room before counting its seats. Serializable retries
      // also cover PostgreSQL snapshots that predate another join's commit.
      const locked = await tx.room.updateMany({ where: { roomCode, status: 'WAITING' }, data: { status: 'WAITING' } });
      if (locked.count !== 1) throw new Error('Room is not available to join');
      const room = await tx.room.findUniqueOrThrow({ where: { roomCode }, include: { players: true } });
      if (room.players.length >= room.maxPlayers) throw new Error('Room is already full');
      await walletService.lockRoomEntry(tx, userId, room.id, room.entryFee, guessNumber);
      const full = room.players.length + 1 === room.maxPlayers;
      if (full) await tx.room.update({ where: { id: room.id }, data: { status: 'COUNTDOWN' } });
      return { id: room.id, full };
    });
    // Start execution immediately after commit, before any socket work.
    if (result.full) this.startRoomCountdown(result.id);
    const room = await this.getRoomDetails(result.id);
    this.io?.to(`room:${result.id}`).emit('room_updated', room);
    await this.broadcastLobbyUpdate();
    return room;
  }

  private startRoomCountdown(roomId: string) {
    if (this.timers.has(roomId)) return;
    let countdown = 5;
    const timer = setInterval(() => {
      this.io?.to(`room:${roomId}`).emit('game_countdown', { countdown });
      if (--countdown < 0) {
        clearInterval(timer);
        this.timers.delete(roomId);
        void this.executeRoll(roomId).catch(async error => {
          console.error('Room execution failed; refunding entries:', roomId, error.message);
          await this.refundRoom(roomId).catch(err => console.error('Room recovery required:', roomId, err.message));
        });
      }
    }, 1000);
    this.timers.set(roomId, timer);
  }

  stopTimers() {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
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
      if (!['WAITING', 'COUNTDOWN', 'ROLLING'].includes(room.status)) return [];
      await tx.room.update({ where: { id: roomId }, data: { status: 'CANCELLED' } });
      for (const player of room.players) {
        await moveWallet(tx, player.userId, room.entryFee, -room.entryFee);
        await tx.transaction.create({ data: {
          userId: player.userId, amount: room.entryFee, type: 'REFUND', referenceId: roomId,
          idempotencyKey: `room-refund:${roomId}:${player.userId}`, description: 'Cancelled game entry refunded',
        } });
      }
      return room.players;
    });
    for (const player of players) this.io?.to(`user:${player.userId}`).emit('balance_updated', await walletService.getWallet(player.userId));
    this.io?.to(`room:${roomId}`).emit('room_updated', await this.getRoomDetails(roomId));
    await this.broadcastLobbyUpdate();
  }

  // The deployment runs one game engine. Before accepting connections, refund
  // all unfinished games from the previous process; never replay a random roll.
  async recoverInterruptedRooms() {
    const rooms = await prisma.room.findMany({ where: { status: { in: ['WAITING', 'COUNTDOWN', 'ROLLING'] } }, select: { id: true } });
    for (const room of rooms) await this.refundRoom(room.id);
  }

  /**
   * Server-authoritative random roll & settlement
   */
  private async executeRoll(roomId: string) {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        players: {
          include: { user: true },
        },
      },
    });

    if (!room || room.players.length === 0) return;

    const started = await prisma.room.updateMany({
      where: { id: roomId, status: 'COUNTDOWN' },
      data: { status: 'ROLLING' },
    });
    if (started.count !== 1) return;

    if (this.io) {
      this.io.to(`room:${roomId}`).emit('roll_started');
    }

    // Simulate animated suspense roll ticks (e.g. 8 rapid ticks before final landing)
    for (let i = 0; i < 8; i++) {
      await new Promise((res) => setTimeout(res, 350));
      const tickNum = crypto.randomInt(1, 11);
      if (this.io) {
        this.io.to(`room:${roomId}`).emit('roll_tick', { number: tickNum });
      }
    }

    // Determine winning number: roll until one of the chosen player numbers hits!
    // This guarantees an exciting, definitive winner without ties.
    const chosenNumbers = room.players.map((p) => p.guessNumber);
    let winningNumber = crypto.randomInt(1, 11);

    while (!chosenNumbers.includes(winningNumber)) {
      winningNumber = crypto.randomInt(1, 11);
    }

    // Find winning player
    const winningPlayer = room.players.find((p) => p.guessNumber === winningNumber)!;
    const totalPool = room.entryFee * room.players.length;

    // Execute atomic settlement in DB
    const settlement = await walletService.settleRoomWinner(
      roomId,
      winningPlayer.userId,
      winningNumber,
      totalPool,
      config.platformCommissionPercent
    );

    const finalRoom = await this.getRoomDetails(roomId);

    // Broadcast celebration and final outcome
    if (this.io) {
      this.io.to(`room:${roomId}`).emit('game_finished', {
        winningNumber,
        winnerId: winningPlayer.userId,
        winnerUsername: winningPlayer.user.username,
        winnerGuess: winningPlayer.guessNumber,
        totalPool,
        winnerPrize: settlement.winnerPrize,
        commissionAmount: settlement.commissionAmount,
        room: finalRoom,
      });

      // Update everyone's live balance
      for (const p of room.players) {
        const wallet = await walletService.getWallet(p.userId);
        this.io.to(`user:${p.userId}`).emit('wallet_updated', wallet);
      }
    }

    await this.broadcastLobbyUpdate();
  }

  /**
   * Helper to fetch full room info with player details
   */
  async getRoomDetails(roomId: string) {
    return prisma.room.findUnique({
      where: { id: roomId },
      include: {
        players: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
        winner: {
          select: { id: true, username: true },
        },
      },
    });
  }

  /**
   * Fetch all open/active rooms for the lobby
   */
  async getActiveRooms() {
    return prisma.room.findMany({
      where: {
        status: { in: ['WAITING', 'COUNTDOWN', 'ROLLING'] },
      },
      include: {
        players: {
          include: {
            user: { select: { id: true, username: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
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
