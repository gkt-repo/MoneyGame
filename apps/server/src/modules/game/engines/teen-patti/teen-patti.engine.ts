import { Server } from 'socket.io';
import {
  GameDescriptor,
  GameType,
  PlayingCard,
  TeenPattiActionType,
  TeenPattiGameState,
  TeenPattiHandResult,
  TeenPattiPlayerState,
} from '@moneygame/shared-types';
import { IGameEngine, RoomWithPlayers, ActionResult } from '../../engine.interface';
import { createDeck, shuffleDeck } from './deck';
import { evaluateTeenPattiHand } from './hand-evaluator';
import { prisma } from '../../../../db';
import { config } from '../../../../config';
import { walletService } from '../../../wallet/wallet.service';

interface InternalPlayerState extends TeenPattiPlayerState {
  cards: PlayingCard[];
}

interface InternalGameState {
  roomId: string;
  roomCode: string;
  bootAmount: number;
  pot: number;
  currentChaalAmount: number;
  currentTurnUserId: string | null;
  turnExpiresAt: number | null;
  roundNumber: number;
  status: 'DEALING' | 'PLAYING' | 'SETTLING' | 'COMPLETED';
  players: Record<string, InternalPlayerState>;
  playerTurnOrder: string[]; // List of userIds in seat order
  turnTimer?: NodeJS.Timeout;
}

export class TeenPattiEngine implements IGameEngine {
  readonly gameType: GameType = 'TEEN_PATTI';

  readonly descriptor: GameDescriptor = {
    id: 'TEEN_PATTI',
    name: 'Teen Patti',
    tagline: 'Classic 3-Card Indian Poker',
    description: 'Ante up, play blind or seen, and challenge opponents in real-time.',
    minPlayers: 2,
    maxPlayers: 6,
    defaultEntryFees: [10, 20, 50, 100, 250, 500],
    icon: '🃏',
    enabled: true,
  };

  private games = new Map<string, InternalGameState>();

  validateCreateOptions(options: {
    entryFee: number;
    maxPlayers: number;
    customConfig?: Record<string, any>;
  }): void {
    if (!Number.isFinite(options.entryFee) || options.entryFee < 1) {
      throw new Error('Boot amount must be at least ₹1.00');
    }
    if (!Number.isInteger(options.maxPlayers) || options.maxPlayers < 2 || options.maxPlayers > 6) {
      throw new Error('Teen Patti tables support between 2 and 6 players');
    }
  }

  validateJoin(room: RoomWithPlayers, userId: string): void {
    if (room.players.length >= room.maxPlayers) {
      throw new Error('Table is already full');
    }
    if (room.players.some(p => p.userId === userId)) {
      throw new Error('You have already joined this table');
    }
  }

  async onPlayerJoined(room: RoomWithPlayers, _userId: string, io: Server | null): Promise<void> {
    // When table fills up to maxPlayers, auto start game countdown
    if (room.players.length >= room.maxPlayers) {
      await this.startGame(room.id, io);
    }
  }

  async startGame(roomId: string, io: Server | null): Promise<void> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        players: {
          include: { user: { select: { id: true, username: true } } },
          orderBy: { seatIndex: 'asc' },
        },
      },
    });

    if (!room || room.players.length < 2) return;

    // Transition status to PLAYING in DB
    await prisma.room.update({
      where: { id: roomId },
      data: { status: 'PLAYING' },
    });

    // Shuffle and deal
    const deck = shuffleDeck(createDeck());
    const playersState: Record<string, InternalPlayerState> = {};
    const playerTurnOrder: string[] = [];

    let cardIdx = 0;
    for (const player of room.players) {
      const playerCards = deck.slice(cardIdx, cardIdx + 3);
      cardIdx += 3;

      playersState[player.userId] = {
        userId: player.userId,
        username: player.user.username,
        seatIndex: player.seatIndex,
        cards: playerCards,
        isSeen: false,
        isPacked: false,
        totalBet: room.entryFee,
      };
      playerTurnOrder.push(player.userId);
    }

    const gameState: InternalGameState = {
      roomId,
      roomCode: room.roomCode,
      bootAmount: room.entryFee,
      pot: room.entryFee * room.players.length,
      currentChaalAmount: room.entryFee,
      currentTurnUserId: playerTurnOrder[0],
      turnExpiresAt: Date.now() + 15000,
      roundNumber: 1,
      status: 'PLAYING',
      players: playersState,
      playerTurnOrder,
    };

    this.games.set(roomId, gameState);

    // Notify room of game start
    if (io) {
      io.to(`room:${roomId}`).emit('game_started', {
        roomId,
        gameType: 'TEEN_PATTI',
        gameState: this.sanitizeStateForClient(gameState),
      });

      // Emit private states to each player
      for (const p of room.players) {
        io.to(`user:${p.userId}`).emit('teen_patti_state', this.sanitizeStateForClient(gameState, p.userId));
      }
    }

    this.startTurnTimer(roomId, io);
  }

  private startTurnTimer(roomId: string, io: Server | null): void {
    const game = this.games.get(roomId);
    if (!game || game.status !== 'PLAYING') return;

    if (game.turnTimer) clearTimeout(game.turnTimer);

    game.turnExpiresAt = Date.now() + 15000;

    game.turnTimer = setTimeout(() => {
      void this.handleTurnTimeout(roomId, io);
    }, 15000);

    if (io) {
      io.to(`room:${roomId}`).emit('turn_timer_started', {
        currentTurnUserId: game.currentTurnUserId,
        turnExpiresAt: game.turnExpiresAt,
      });
    }
  }

  private async handleTurnTimeout(roomId: string, io: Server | null): Promise<void> {
    const game = this.games.get(roomId);
    if (!game || !game.currentTurnUserId || game.status !== 'PLAYING') return;

    console.log(`[TeenPattiEngine] Turn timeout for user ${game.currentTurnUserId} in room ${roomId}. Auto-packing.`);
    await this.handleAction(roomId, game.currentTurnUserId, 'PACK', {}, io);
  }

  async handleAction(
    roomId: string,
    userId: string,
    action: string,
    _payload: any,
    io: Server | null
  ): Promise<ActionResult> {
    const game = this.games.get(roomId);
    if (!game) {
      return { success: false, message: 'Game not found or inactive' };
    }

    const player = game.players[userId];
    if (!player) {
      return { success: false, message: 'Player not part of this table' };
    }

    if (player.isPacked) {
      return { success: false, message: 'You have folded this hand' };
    }

    const act = action.toUpperCase() as TeenPattiActionType;

    // 1. SEE CARDS (can be done anytime during the hand)
    if (act === 'SEE_CARDS') {
      player.isSeen = true;
      player.lastAction = 'SEE_CARDS';

      if (io) {
        // Send actual cards only to this user
        io.to(`user:${userId}`).emit('cards_revealed', {
          cards: player.cards,
          hand: evaluateTeenPattiHand(player.cards),
        });
        // Broadcast to table that this player is now 'Seen'
        io.to(`room:${roomId}`).emit('player_seen', { userId, seatIndex: player.seatIndex });
        this.broadcastGameState(roomId, io);
      }
      return { success: true, message: 'Cards revealed', gameState: this.getClientState(roomId, userId) };
    }

    // All betting actions (CHAAL, BLIND, PACK, SHOW) require it to be the player's turn!
    if (game.currentTurnUserId !== userId) {
      return { success: false, message: 'Not your turn' };
    }

    // 2. PACK (Fold)
    if (act === 'PACK') {
      player.isPacked = true;
      player.lastAction = 'PACK';

      if (io) {
        io.to(`room:${roomId}`).emit('player_packed', { userId, seatIndex: player.seatIndex });
      }

      const activePlayers = Object.values(game.players).filter(p => !p.isPacked);
      if (activePlayers.length === 1) {
        // Only 1 player remains! Winner by default fold
        await this.settleWinner(roomId, activePlayers[0].userId, io, 'All opponents folded');
        return { success: true, message: 'Folded' };
      }

      this.advanceToNextTurn(roomId, io);
      return { success: true, message: 'Folded' };
    }

    // 3. BLIND
    if (act === 'BLIND') {
      if (player.isSeen) {
        return { success: false, message: 'Cannot play blind after seeing your cards' };
      }

      const betAmount = game.currentChaalAmount;
      game.pot += betAmount;
      player.totalBet += betAmount;
      player.lastAction = 'BLIND';

      if (io) {
        io.to(`room:${roomId}`).emit('player_acted', {
          userId,
          action: 'BLIND',
          betAmount,
          pot: game.pot,
        });
      }

      this.advanceToNextTurn(roomId, io);
      return { success: true, message: 'Blind placed' };
    }

    // 4. CHAAL
    if (act === 'CHAAL') {
      const betAmount = player.isSeen ? game.currentChaalAmount * 2 : game.currentChaalAmount;
      game.pot += betAmount;
      player.totalBet += betAmount;
      player.lastAction = 'CHAAL';

      if (io) {
        io.to(`room:${roomId}`).emit('player_acted', {
          userId,
          action: 'CHAAL',
          betAmount,
          pot: game.pot,
        });
      }

      this.advanceToNextTurn(roomId, io);
      return { success: true, message: 'Chaal placed' };
    }

    // 5. SHOW
    if (act === 'SHOW') {
      const activePlayers = Object.values(game.players).filter(p => !p.isPacked);
      if (activePlayers.length > 2) {
        return { success: false, message: 'Show can only be called when 2 players remain' };
      }

      // Show cost
      const showCost = player.isSeen ? game.currentChaalAmount * 2 : game.currentChaalAmount;
      game.pot += showCost;
      player.totalBet += showCost;

      // Evaluate hands of all active players
      const evaluations = activePlayers.map(p => ({
        player: p,
        handResult: evaluateTeenPattiHand(p.cards),
      }));

      // Sort descending by score
      evaluations.sort((a, b) => b.handResult.score - a.handResult.score);
      const winner = evaluations[0];

      await this.settleWinner(roomId, winner.player.userId, io, `Won with ${winner.handResult.description}`, evaluations);
      return { success: true, message: 'Show completed' };
    }

    return { success: false, message: `Unsupported action: ${action}` };
  }

  private advanceToNextTurn(roomId: string, io: Server | null): void {
    const game = this.games.get(roomId);
    if (!game || game.status !== 'PLAYING') return;

    if (game.turnTimer) clearTimeout(game.turnTimer);

    const activeOrder = game.playerTurnOrder.filter(uid => !game.players[uid].isPacked);
    if (activeOrder.length <= 1) return;

    const currentIdx = activeOrder.indexOf(game.currentTurnUserId || '');
    const nextIdx = (currentIdx + 1) % activeOrder.length;
    game.currentTurnUserId = activeOrder[nextIdx];

    if (nextIdx === 0) {
      game.roundNumber += 1;
    }

    this.startTurnTimer(roomId, io);
    this.broadcastGameState(roomId, io);
  }

  private async settleWinner(
    roomId: string,
    winnerId: string,
    io: Server | null,
    reason?: string,
    showdownResults?: Array<{ player: InternalPlayerState; handResult: TeenPattiHandResult }>
  ): Promise<void> {
    const game = this.games.get(roomId);
    if (!game) return;

    if (game.turnTimer) clearTimeout(game.turnTimer);
    game.status = 'SETTLING';

    const winner = game.players[winnerId];
    const totalPool = game.pot;

    try {
      // Settle in DB via wallet ledger
      const settlement = await walletService.settleRoomWinner(
        roomId,
        winnerId,
        0, // Card games do not use guess number
        totalPool,
        config.platformCommissionPercent
      );

      const finalRoom = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          players: { include: { user: { select: { id: true, username: true } } } },
          winner: { select: { id: true, username: true } },
        },
      });

      game.status = 'COMPLETED';

      if (io) {
        io.to(`room:${roomId}`).emit('game_finished', {
          winnerId,
          winnerUsername: winner?.username || 'Winner',
          prizePool: totalPool,
          winnerPrize: settlement.winnerPrize,
          commissionAmount: settlement.commissionAmount,
          reason,
          showdown: showdownResults?.map(s => ({
            userId: s.player.userId,
            username: s.player.username,
            cards: s.player.cards,
            handResult: s.handResult,
          })),
          room: finalRoom,
        });

        // Update all players' live balances
        for (const p of Object.values(game.players)) {
          const wallet = await walletService.getWallet(p.userId);
          io.to(`user:${p.userId}`).emit('wallet_updated', wallet);
        }
      }
    } catch (err: any) {
      console.error('[TeenPattiEngine] Settlement failed:', roomId, err.message);
    } finally {
      this.cleanupRoom(roomId);
    }
  }

  private broadcastGameState(roomId: string, io: Server | null): void {
    const game = this.games.get(roomId);
    if (!game || !io) return;

    // Send public state to room channel
    io.to(`room:${roomId}`).emit('teen_patti_state', this.sanitizeStateForClient(game));

    // Send private states to each player with their own cards if seen
    for (const uid of game.playerTurnOrder) {
      io.to(`user:${uid}`).emit('teen_patti_state', this.sanitizeStateForClient(game, uid));
    }
  }

  getClientState(roomId: string, userId?: string): TeenPattiGameState | null {
    const game = this.games.get(roomId);
    if (!game) return null;
    return this.sanitizeStateForClient(game, userId);
  }

  private sanitizeStateForClient(game: InternalGameState, forUserId?: string): TeenPattiGameState {
    const sanitizedPlayers: Record<string, TeenPattiPlayerState> = {};

    for (const [uid, p] of Object.entries(game.players)) {
      // Anti-cheat: ONLY send cards if this is the player themselves AND they have seen cards,
      // or if the game has completed
      const showCards = game.status === 'COMPLETED' || (uid === forUserId && p.isSeen);

      sanitizedPlayers[uid] = {
        userId: p.userId,
        username: p.username,
        seatIndex: p.seatIndex,
        isSeen: p.isSeen,
        isPacked: p.isPacked,
        totalBet: p.totalBet,
        lastAction: p.lastAction,
        cards: showCards ? p.cards : undefined,
      };
    }

    return {
      pot: game.pot,
      bootAmount: game.bootAmount,
      currentChaalAmount: game.currentChaalAmount,
      currentTurnUserId: game.currentTurnUserId,
      turnExpiresAt: game.turnExpiresAt,
      roundNumber: game.roundNumber,
      players: sanitizedPlayers,
    };
  }

  cleanupRoom(roomId: string): void {
    const game = this.games.get(roomId);
    if (game?.turnTimer) {
      clearTimeout(game.turnTimer);
    }
    this.games.delete(roomId);
  }
}

export const teenPattiEngine = new TeenPattiEngine();
