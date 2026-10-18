import crypto from 'crypto';
import { Server, Socket } from 'socket.io';
import { prisma } from '../../db';
import { config } from '../../config';
import { walletService } from '../wallet/wallet.service';

export class GameManager {
  private io: Server | null = null;

  setSocketServer(io: Server) {
    this.io = io;
  }

  /**
   * Create a new multiplayer room with entry fee & host's guess
   */
  async createRoom(hostUserId: string, entryFee: number, maxPlayers: number, guessNumber: number) {
    if (entryFee < 1) throw new Error('Minimum entry fee is ₹1.00');
    if (maxPlayers < 2 || maxPlayers > 10) throw new Error('Max players must be between 2 and 10');
    if (guessNumber < 1 || guessNumber > 10) throw new Error('Guess number must be between 1 and 10');

    // Generate clean 6-digit room code
    const roomCode = 'R-' + Math.floor(1000 + Math.random() * 9000);

    const room = await prisma.room.create({
      data: {
        roomCode,
        entryFee,
        maxPlayers,
        status: 'WAITING',
      },
    });

    // Lock host's entry fee
    await walletService.lockRoomEntry(hostUserId, room.id, entryFee, guessNumber);

    const fullRoom = await this.getRoomDetails(room.id);
    this.broadcastLobbyUpdate();
    return fullRoom;
  }

  /**
   * Join an existing room and pick an available number
   */
  async joinRoom(userId: string, roomCode: string, guessNumber: number) {
    if (guessNumber < 1 || guessNumber > 10) throw new Error('Guess number must be between 1 and 10');

    const room = await prisma.room.findUnique({
      where: { roomCode },
      include: { players: true },
    });

    if (!room) throw new Error('Room not found');
    if (room.status !== 'WAITING') throw new Error(`Cannot join room: status is ${room.status}`);
    if (room.players.length >= room.maxPlayers) throw new Error('Room is already full');

    // Lock player entry fee and register guess
    await walletService.lockRoomEntry(userId, room.id, room.entryFee, guessNumber);

    const updatedRoom = await this.getRoomDetails(room.id);

    // Notify room participants
    if (this.io) {
      this.io.to(room.id).emit('room_updated', updatedRoom);
    }
    this.broadcastLobbyUpdate();

    // If room is now full, trigger game countdown automatically!
    if (updatedRoom && updatedRoom.players.length >= updatedRoom.maxPlayers) {
      this.startRoomCountdown(room.id);
    }

    return updatedRoom;
  }

  /**
   * Start 5-second countdown when room is full, then execute roll
   */
  async startRoomCountdown(roomId: string) {
    let countdown = 5;

    await prisma.room.update({
      where: { id: roomId },
      data: { status: 'COUNTDOWN' },
    });

    const interval = setInterval(async () => {
      if (this.io) {
        this.io.to(roomId).emit('game_countdown', { countdown });
      }

      countdown--;

      if (countdown < 0) {
        clearInterval(interval);
        await this.executeRoll(roomId);
      }
    }, 1000);
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

    await prisma.room.update({
      where: { id: roomId },
      data: { status: 'ROLLING' },
    });

    if (this.io) {
      this.io.to(roomId).emit('roll_started');
    }

    // Simulate animated suspense roll ticks (e.g. 8 rapid ticks before final landing)
    for (let i = 0; i < 8; i++) {
      await new Promise((res) => setTimeout(res, 350));
      const tickNum = crypto.randomInt(1, 11);
      if (this.io) {
        this.io.to(roomId).emit('roll_tick', { number: tickNum });
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
      this.io.to(roomId).emit('game_finished', {
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

    this.broadcastLobbyUpdate();
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
