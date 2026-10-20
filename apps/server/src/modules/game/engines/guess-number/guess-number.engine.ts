import crypto from 'crypto';
import { Server } from 'socket.io';
import { GameDescriptor, GameType } from '@moneygame/shared-types';
import { IGameEngine, RoomWithPlayers, ActionResult } from '../../engine.interface';
import { prisma } from '../../../../db';
import { config } from '../../../../config';
import { walletService, getEffectiveCommissionPercent } from '../../../wallet/wallet.service';

export class GuessNumberEngine implements IGameEngine {
  readonly gameType: GameType = 'GUESS_NUMBER';

  readonly descriptor: GameDescriptor = {
    id: 'GUESS_NUMBER',
    name: 'Dice Guess',
    tagline: 'Guess the lucky number 1-10',
    description: 'Pick a secret number between 1 and 10. The suspense wheel rolls until a player hits!',
    minPlayers: 2,
    maxPlayers: 10,
    defaultEntryFees: [10, 25, 50, 100, 250],
    icon: '🎲',
    enabled: true,
  };

  private timers = new Map<string, ReturnType<typeof setInterval>>();

  validateCreateOptions(options: {
    entryFee: number;
    maxPlayers: number;
    guessNumber?: number;
  }): void {
    if (options.guessNumber === undefined || options.guessNumber === null) {
      throw new Error('Guess number is required for Dice Guess');
    }
    this.validateGuess(options.guessNumber);
    if (!Number.isInteger(options.maxPlayers) || options.maxPlayers < 2 || options.maxPlayers > 10) {
      throw new Error('Max players must be between 2 and 10');
    }
  }

  validateJoin(
    room: RoomWithPlayers,
    _userId: string,
    joinData?: { guessNumber?: number }
  ): void {
    if (joinData?.guessNumber === undefined || joinData.guessNumber === null) {
      throw new Error('Guess number is required to join');
    }
    this.validateGuess(joinData.guessNumber);
  }

  private validateGuess(guess: number): void {
    if (!Number.isInteger(guess) || guess < 1 || guess > 10) {
      throw new Error('Guess must be an integer between 1 and 10');
    }
  }

  async onPlayerJoined(room: RoomWithPlayers, _userId: string, io: Server | null): Promise<void> {
    if (room.players.length >= room.maxPlayers) {
      await this.startGame(room.id, io);
    }
  }

  async startGame(roomId: string, io: Server | null): Promise<void> {
    if (this.timers.has(roomId)) return;
    let countdown = 5;
    const timer = setInterval(() => {
      io?.to(`room:${roomId}`).emit('game_countdown', { countdown });
      if (--countdown < 0) {
        clearInterval(timer);
        this.timers.delete(roomId);
        void this.executeRoll(roomId, io).catch(async error => {
          console.error('[GuessNumberEngine] Roll execution failed:', roomId, error.message);
        });
      }
    }, 1000);
    this.timers.set(roomId, timer);
  }

  private async executeRoll(roomId: string, io: Server | null): Promise<void> {
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

    io?.to(`room:${roomId}`).emit('roll_started');

    // Simulate animated suspense roll ticks
    for (let i = 0; i < 8; i++) {
      await new Promise(res => setTimeout(res, 350));
      const tickNum = crypto.randomInt(1, 11);
      io?.to(`room:${roomId}`).emit('roll_tick', { number: tickNum });
    }

    // Determine winning number: roll until one of the chosen player numbers hits!
    const chosenNumbers = room.players
      .map(p => p.guessNumber)
      .filter((n): n is number => n !== null);

    let winningNumber = crypto.randomInt(1, 11);
    while (!chosenNumbers.includes(winningNumber)) {
      winningNumber = crypto.randomInt(1, 11);
    }

    const winningPlayer = room.players.find(p => p.guessNumber === winningNumber)!;
    const totalPool = room.entryFee * room.players.length;

    const settlement = await walletService.settleRoomWinner(
      roomId,
      winningPlayer.userId,
      winningNumber,
      totalPool,
      await getEffectiveCommissionPercent()
    );

    const finalRoom = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        players: { include: { user: { select: { id: true, username: true } } } },
        winner: { select: { id: true, username: true } },
      },
    });

    if (io) {
      io.to(`room:${roomId}`).emit('game_finished', {
        winningNumber,
        winnerId: winningPlayer.userId,
        winnerUsername: winningPlayer.user.username,
        winnerGuess: winningPlayer.guessNumber,
        totalPool,
        winnerPrize: settlement.winnerPrize,
        commissionAmount: settlement.commissionAmount,
        room: finalRoom,
      });

      for (const p of room.players) {
        const wallet = await walletService.getWallet(p.userId);
        io.to(`user:${p.userId}`).emit('wallet_updated', wallet);
      }
    }
  }

  async handleAction(
    _roomId: string,
    _userId: string,
    _action: string,
    _payload: any,
    _io: Server | null
  ): Promise<ActionResult> {
    return { success: false, message: 'Dice Guess does not support in-game actions' };
  }

  getClientState(_roomId: string, _userId?: string): any {
    return null;
  }

  cleanupRoom(roomId: string): void {
    const timer = this.timers.get(roomId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(roomId);
    }
  }

  stopAllTimers(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }
}

export const guessNumberEngine = new GuessNumberEngine();
