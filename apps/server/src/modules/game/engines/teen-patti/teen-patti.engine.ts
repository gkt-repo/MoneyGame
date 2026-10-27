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
import { roomCountdown } from '../../room-presentation';
import { walletService, getEffectiveCommissionPercent } from '../../../wallet/wallet.service';

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
  turnTimer?: NodeJS.Timeout | null;
  pendingSettlement?: {
    winnerId: string;
    reason?: string;
    showdownResults?: Array<{ player: InternalPlayerState; handResult: TeenPattiHandResult }>;
  } | null;
}

const TURN_TIMEOUT_MS = 25000;


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
  private actionQueues = new Map<string, Promise<any>>();
  private isShuttingDown = false;

  private async runWithRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    const current = this.actionQueues.get(roomId) || Promise.resolve();
    let release: () => void;
    const next = new Promise<void>(resolve => { release = resolve; });
    const chained = current.then(() => next, () => next);
    this.actionQueues.set(roomId, chained);

    try {
      await current;
      return await fn();
    } finally {
      release!();
      if (this.actionQueues.get(roomId) === chained) {
        this.actionQueues.delete(roomId);
      }
    }
  }

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

    if (!room || room.players.length !== room.maxPlayers ||
        !['WAITING', 'COUNTDOWN'].includes(room.status) || this.games.has(roomId)) return;
    if ((roomCountdown(room) ?? 0) > 0) return;

    // Transition status to PLAYING in DB
    const started = await prisma.room.updateMany({
      where: { id: roomId, status: room.status },
      data: { status: 'PLAYING' },
    });
    if (started.count !== 1) return;

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
      turnExpiresAt: Date.now() + TURN_TIMEOUT_MS,
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
    if (this.isShuttingDown) return;
    const game = this.games.get(roomId);
    if (!game || game.status !== 'PLAYING') return;

    if (game.turnTimer) clearTimeout(game.turnTimer);

    game.turnExpiresAt = Date.now() + TURN_TIMEOUT_MS;

    game.turnTimer = setTimeout(() => {
      void this.handleTurnTimeout(roomId, io);
    }, TURN_TIMEOUT_MS);

    if (io) {
      io.to(`room:${roomId}`).emit('turn_timer_started', {
        roomId,
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
    return this.runWithRoomLock(roomId, async () => {
      return this.executeAction(roomId, userId, action, _payload, io);
    });
  }

  private async executeAction(
    roomId: string,
    userId: string,
    action: string,
    _payload: any,
    io: Server | null
  ): Promise<ActionResult> {
    const game = this.games.get(roomId);
    if (!game) {
      const dbRoom = await prisma.room.findUnique({
        where: { id: roomId },
        select: { status: true },
      });
      if (dbRoom?.status === 'COMPLETED') {
        return { success: false, message: 'This hand has already concluded' };
      }
      return { success: false, message: 'Game not found or inactive' };
    }

    if (game.status === 'COMPLETED') {
      return { success: false, message: 'This hand has already concluded' };
    }

    if (game.status === 'SETTLING') {
      if (game.pendingSettlement) {
        try {
          await this.settleWinner(
            roomId,
            game.pendingSettlement.winnerId,
            io,
            game.pendingSettlement.reason,
            game.pendingSettlement.showdownResults
          );
          return { success: true, message: 'Hand settled successfully' };
        } catch (err: any) {
          return { success: false, message: 'Settlement is currently retrying: ' + err.message };
        }
      }
      return { success: false, message: 'This hand has already concluded' };
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

      const hand = evaluateTeenPattiHand(player.cards);

      if (io) {
        // Send actual cards only to this user with roomId
        io.to(`user:${userId}`).emit('cards_revealed', {
          roomId,
          cards: player.cards,
          hand,
        });
        // Broadcast to table that this player is now 'Seen'
        io.to(`room:${roomId}`).emit('player_seen', { userId, seatIndex: player.seatIndex });
        this.broadcastGameState(roomId, io);
      }
      return {
        success: true,
        message: 'Cards revealed',
        cards: player.cards,
        hand,
        gameState: this.getClientState(roomId, userId),
      };
    }

    // All betting actions (CHAAL, BLIND, PACK, SHOW, SIDE_SHOW) require it to be the player's turn!
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
        game.currentTurnUserId = null;
        if (game.turnTimer) clearTimeout(game.turnTimer);
        try {
          await this.settleWinner(roomId, activePlayers[0].userId, io, 'All opponents folded');
          return { success: true, message: 'Folded' };
        } catch (err: any) {
          return { success: false, message: 'Settlement failed: ' + err.message };
        }
      }

      this.advanceToNextTurn(roomId, io);
      return { success: true, message: 'Folded' };
    }

    // 3. BLIND
    if (act === 'BLIND') {
      if (player.isSeen) {
        return { success: false, message: 'Cannot play blind after seeing your cards' };
      }

      const multiplier = Number(_payload?.multiplier) === 2 ? 2 : 1;
      const expectedBet = game.currentChaalAmount * multiplier;
      if (_payload?.amount !== undefined && _payload?.amount !== null) {
        if (Number(_payload.amount) !== expectedBet) {
          return { success: false, message: `Invalid bet amount. Expected: ₹${expectedBet}` };
        }
      }
      const betAmount = expectedBet;

      let updatedWallet: any;
      try {
        updatedWallet = await walletService.lockGameBet(userId, roomId, betAmount, 'BLIND');
      } catch (err: any) {
        return { success: false, message: err.message || 'Insufficient wallet balance for Blind' };
      }

      if (betAmount > game.currentChaalAmount) {
        game.currentChaalAmount = betAmount;
      }

      game.pot += betAmount;
      player.totalBet += betAmount;
      player.lastAction = 'BLIND';

      if (io) {
        io.to(`user:${userId}`).emit('balance_updated', updatedWallet);
        io.to(`user:${userId}`).emit('wallet_updated', updatedWallet);
        io.to(`room:${roomId}`).emit('player_acted', {
          userId,
          action: 'BLIND',
          betAmount,
          pot: game.pot,
          currentChaalAmount: game.currentChaalAmount,
        });
      }

      this.advanceToNextTurn(roomId, io);
      return { success: true, message: 'Blind placed', wallet: updatedWallet, gameState: this.getClientState(roomId, userId) };
    }

    // 4. CHAAL
    if (act === 'CHAAL') {
      const baseCost = player.isSeen ? game.currentChaalAmount * 2 : game.currentChaalAmount;
      const multiplier = Number(_payload?.multiplier) === 2 ? 2 : 1;
      const expectedBet = baseCost * multiplier;
      if (_payload?.amount !== undefined && _payload?.amount !== null) {
        if (Number(_payload.amount) !== expectedBet) {
          return { success: false, message: `Invalid bet amount. Expected: ₹${expectedBet}` };
        }
      }
      const betAmount = expectedBet;

      let updatedWallet: any;
      try {
        updatedWallet = await walletService.lockGameBet(userId, roomId, betAmount, 'CHAAL');
      } catch (err: any) {
        return { success: false, message: err.message || 'Insufficient wallet balance for Chaal' };
      }

      if (multiplier === 2) {
        game.currentChaalAmount = player.isSeen ? betAmount / 2 : betAmount;
      }

      game.pot += betAmount;
      player.totalBet += betAmount;
      player.lastAction = 'CHAAL';

      if (io) {
        io.to(`user:${userId}`).emit('balance_updated', updatedWallet);
        io.to(`user:${userId}`).emit('wallet_updated', updatedWallet);
        io.to(`room:${roomId}`).emit('player_acted', {
          userId,
          action: 'CHAAL',
          betAmount,
          pot: game.pot,
          currentChaalAmount: game.currentChaalAmount,
        });
      }

      this.advanceToNextTurn(roomId, io);
      return { success: true, message: 'Chaal placed', wallet: updatedWallet, gameState: this.getClientState(roomId, userId) };
    }

    // 5. SIDE SHOW (Compromise with previous seen player)
    if (act === 'SIDE_SHOW') {
      const activePlayers = Object.values(game.players).filter(p => !p.isPacked);
      if (activePlayers.length <= 2) {
        return { success: false, message: 'Side show is only available with 3+ players. Use Show instead.' };
      }

      if (!player.isSeen) {
        return { success: false, message: 'You must see your cards before requesting a Side Show' };
      }

      // Find previous active player in turn order
      const activeOrder = game.playerTurnOrder.filter(uid => !game.players[uid].isPacked);
      const myIdx = activeOrder.indexOf(userId);
      const prevIdx = (myIdx - 1 + activeOrder.length) % activeOrder.length;
      const prevUserId = activeOrder[prevIdx];
      const prevPlayer = game.players[prevUserId];

      if (!prevPlayer) {
        return { success: false, message: 'Previous player not found' };
      }

      if (!prevPlayer.isSeen) {
        return { success: false, message: `${prevPlayer.username} is playing Blind. Side show only allowed with Seen players.` };
      }

      const sideShowCost = game.currentChaalAmount * 2;
      let updatedWallet: any;
      try {
        updatedWallet = await walletService.lockGameBet(userId, roomId, sideShowCost, 'SIDE_SHOW');
      } catch (err: any) {
        return { success: false, message: err.message || 'Insufficient wallet balance for Side Show' };
      }

      game.pot += sideShowCost;
      player.totalBet += sideShowCost;
      player.lastAction = 'SIDE_SHOW';

      // Compare hands
      const myHand = evaluateTeenPattiHand(player.cards);
      const prevHand = evaluateTeenPattiHand(prevPlayer.cards);

      const requesterLost = myHand.score <= prevHand.score;
      const loser = requesterLost ? player : prevPlayer;
      const winner = requesterLost ? prevPlayer : player;
      loser.isPacked = true;

      if (io) {
        io.to(`user:${userId}`).emit('balance_updated', updatedWallet);
        io.to(`user:${userId}`).emit('wallet_updated', updatedWallet);
        io.to(`room:${roomId}`).emit('player_acted', {
          userId,
          action: 'SIDE_SHOW',
          betAmount: sideShowCost,
          pot: game.pot,
        });
        // Public broadcast to room announces result without revealing surviving hand details
        io.to(`room:${roomId}`).emit('side_show_result', {
          requesterId: userId,
          requesterUsername: player.username,
          targetId: prevUserId,
          targetUsername: prevPlayer.username,
          winnerId: winner.userId,
          winnerUsername: winner.username,
          loserId: loser.userId,
          loserUsername: loser.username,
          message: `${loser.username} lost the Side Show and folded!`,
        });
        // Detailed comparison sent privately only to participants
        io.to(`user:${userId}`).emit('side_show_comparison', {
          yourHand: myHand,
          opponentHand: prevHand,
          winnerId: winner.userId,
        });
        io.to(`user:${prevUserId}`).emit('side_show_comparison', {
          yourHand: prevHand,
          opponentHand: myHand,
          winnerId: winner.userId,
        });
        io.to(`room:${roomId}`).emit('player_packed', {
          userId: loser.userId,
          seatIndex: loser.seatIndex,
        });
        this.broadcastGameState(roomId, io);
      }

      const remainingActive = Object.values(game.players).filter(p => !p.isPacked);
      if (remainingActive.length === 1) {
        game.currentTurnUserId = null;
        if (game.turnTimer) clearTimeout(game.turnTimer);
        try {
          await this.settleWinner(roomId, remainingActive[0].userId, io, 'Opponent folded after Side Show');
          return { success: true, message: 'Side Show completed. Table winner decided!' };
        } catch (err: any) {
          return { success: false, message: 'Settlement failed: ' + err.message };
        }
      }

      this.advanceToNextTurn(roomId, io);
      return {
        success: true,
        message: requesterLost ? 'You lost the Side Show and folded.' : `${prevPlayer.username} lost the Side Show and folded!`,
        wallet: updatedWallet,
        gameState: this.getClientState(roomId, userId),
      };
    }

    // 6. SHOW
    if (act === 'SHOW') {
      const activePlayers = Object.values(game.players).filter(p => !p.isPacked);
      if (activePlayers.length > 2) {
        return { success: false, message: 'Show can only be called when 2 players remain' };
      }

      // Show cost
      const showCost = player.isSeen ? game.currentChaalAmount * 2 : game.currentChaalAmount;

      let updatedWallet: any;
      try {
        updatedWallet = await walletService.lockGameBet(userId, roomId, showCost, 'SHOW');
      } catch (err: any) {
        return { success: false, message: err.message || 'Insufficient wallet balance for Show' };
      }

      game.pot += showCost;
      player.totalBet += showCost;
      player.lastAction = 'SHOW';

      if (io) {
        io.to(`user:${userId}`).emit('balance_updated', updatedWallet);
        io.to(`user:${userId}`).emit('wallet_updated', updatedWallet);
      }

      // Evaluate hands of all active players
      const evaluations = activePlayers.map(p => ({
        player: p,
        handResult: evaluateTeenPattiHand(p.cards),
      }));

      // Sort descending by score
      evaluations.sort((a, b) => b.handResult.score - a.handResult.score);
      const winner = evaluations[0];

      try {
        await this.settleWinner(roomId, winner.player.userId, io, `Won with ${winner.handResult.description}`, evaluations);
        return { success: true, message: 'Show completed' };
      } catch (err: any) {
        return { success: false, message: 'Settlement failed: ' + err.message };
      }
    }

    return { success: false, message: `Unsupported action: ${action}` };
  }

  private advanceToNextTurn(roomId: string, io: Server | null): void {
    const game = this.games.get(roomId);
    if (!game || game.status !== 'PLAYING') return;

    if (game.turnTimer) {
      clearTimeout(game.turnTimer);
      game.turnTimer = null;
    }

    const activePlayers = Object.values(game.players).filter(p => !p.isPacked);
    if (activePlayers.length <= 1) return;

    const currentOrderIdx = game.playerTurnOrder.indexOf(game.currentTurnUserId || '');
    let nextPlayerUid: string | null = null;
    let wrapped = false;

    for (let i = 1; i <= game.playerTurnOrder.length; i++) {
      const candidateIdx = (currentOrderIdx + i) % game.playerTurnOrder.length;
      if (candidateIdx <= currentOrderIdx && i > 0) {
        wrapped = true;
      }
      const candidateUid = game.playerTurnOrder[candidateIdx];
      if (!game.players[candidateUid].isPacked) {
        nextPlayerUid = candidateUid;
        break;
      }
    }

    if (!nextPlayerUid) return;

    game.currentTurnUserId = nextPlayerUid;
    if (wrapped) {
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

    if (game.turnTimer) {
      clearTimeout(game.turnTimer);
      game.turnTimer = null;
    }
    game.status = 'SETTLING';
    game.pendingSettlement = { winnerId, reason, showdownResults };

    const winner = game.players[winnerId];
    const totalPool = game.pot;

    const playerBets: Record<string, number> = {};
    for (const p of Object.values(game.players)) {
      playerBets[p.userId] = p.totalBet;
    }

    try {
      // Settle in DB via wallet ledger using dynamic system commission
      const effectiveCommission = await getEffectiveCommissionPercent();
      const settlement = await walletService.settleRoomWinner(
        roomId,
        winnerId,
        0, // Card games do not use guess number
        totalPool,
        effectiveCommission,
        playerBets
      );

      const finalRoom = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          players: { include: { user: { select: { id: true, username: true } } } },
          winner: { select: { id: true, username: true } },
        },
      });

      game.status = 'COMPLETED';
      game.pendingSettlement = null;

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

        // Broadcast final state with all revealed cards
        this.broadcastGameState(roomId, io);

        // Update all players' live balances
        for (const p of Object.values(game.players)) {
          const wallet = await walletService.getWallet(p.userId);
          io.to(`user:${p.userId}`).emit('wallet_updated', wallet);
          io.to(`user:${p.userId}`).emit('balance_updated', wallet);
        }
      }

      // Retain finished game state in memory for 2 minutes so late/reconnecting clients receive completed state & cards
      setTimeout(() => {
        this.cleanupRoom(roomId);
      }, 120000);
    } catch (err: any) {
      console.error('[TeenPattiEngine] Settlement failed:', roomId, err.message);
      if (!this.isShuttingDown) {
        setTimeout(() => {
          const g = this.games.get(roomId);
          if (g && g.status === 'SETTLING' && g.pendingSettlement) {
            void this.runWithRoomLock(roomId, async () => {
              if (g.status === 'SETTLING' && g.pendingSettlement) {
                await this.settleWinner(roomId, winnerId, io, reason, showdownResults);
              }
            }).catch(() => {});
          }
        }, 3000);
      }
      throw err;
    }
  }

  private broadcastGameState(roomId: string, io: Server | null): void {
    const game = this.games.get(roomId);
    if (!game || !io) return;

    // Send public state to room channel
    const publicState: any = { ...this.sanitizeStateForClient(game), roomId };
    io.to(`room:${roomId}`).emit('teen_patti_state', publicState);

    // Send private states to each player with their own cards if seen
    for (const uid of game.playerTurnOrder) {
      const privateState: any = { ...this.sanitizeStateForClient(game, uid), roomId };
      io.to(`user:${uid}`).emit('teen_patti_state', privateState);
    }
  }

  getClientState(roomId: string, userId?: string): TeenPattiGameState | null {
    const game = this.games.get(roomId);
    if (!game) return null;
    const state: any = { ...this.sanitizeStateForClient(game, userId), roomId };
    return state;
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
      roomId: game.roomId,
      roomCode: game.roomCode,
      pot: game.pot,
      bootAmount: game.bootAmount,
      currentChaalAmount: game.currentChaalAmount,
      currentTurnUserId: game.currentTurnUserId,
      turnExpiresAt: game.turnExpiresAt,
      roundNumber: game.roundNumber,
      players: sanitizedPlayers,
    } as any;
  }

  cleanupRoom(roomId: string): void {
    const game = this.games.get(roomId);
    if (game?.turnTimer) {
      clearTimeout(game.turnTimer);
      game.turnTimer = null;
    }
    this.games.delete(roomId);
    this.actionQueues.delete(roomId);
  }

  stopAllTimers(): void {
    this.isShuttingDown = true;
    for (const game of this.games.values()) {
      if (game.turnTimer) {
        clearTimeout(game.turnTimer);
        game.turnTimer = null;
      }
    }
  }
}

export const teenPattiEngine = new TeenPattiEngine();
