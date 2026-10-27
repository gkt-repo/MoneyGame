import { Server } from 'socket.io';
import { publicRoomConfig } from '../../room-presentation';
import {
  GameDescriptor,
  GameType,
  CardSuit,
  PlayingCard,
  TwentyNineGameState,
  TwentyNinePlayerState,
  TwentyNineTrick,
  TwentyNineTrickCard,
} from '@moneygame/shared-types';
import { IGameEngine, RoomWithPlayers, ActionResult } from '../../engine.interface';
import { createTwentyNineDeck, shuffleDeck, getCardPoints, getCardPower, TWENTY_NINE_SUITS } from './deck';
import { prisma } from '../../../../db';
import { serializable } from '../../../../transaction';
import { moveWallet } from '../../../../wallet-ledger';
import { toPaise } from '../../../../money';
import { getEffectiveCommissionPercent, walletService } from '../../../wallet/wallet.service';
import { notificationService } from '../../../notification/notification.service';

const TURN_TIMEOUT_MS = 20000; // 20 seconds per turn
const MIN_BID = 16;
const MAX_BID = 28;

interface InternalPlayerState extends TwentyNinePlayerState {
  cards: PlayingCard[];
}

interface InternalGameState extends Omit<TwentyNineGameState, 'players'> {
  roomId: string;
  roomCode: string;
  isPrivate: boolean;
  createdAt: string;
  sequence: number;
  lastAction?: { id: string; userId: string; fingerprint: string };
  disconnectedSince?: Record<string, number>;
  graceUsed?: Record<string, boolean>;
  entryFee: number;
  deck: PlayingCard[]; // remaining cards in deck
  players: Record<string, InternalPlayerState>;
  playerOrder: string[]; // userIds sorted by seatIndex (0, 1, 2, 3)
}

export class TwentyNineEngine implements IGameEngine {
  readonly gameType: GameType = 'TWENTY_NINE';

  readonly descriptor: GameDescriptor = {
    id: 'TWENTY_NINE',
    name: '29 Card Game',
    tagline: 'Strategic 4-Player Partnership Trick-Taking',
    description: 'South Asian classic 32-card partnership trick game. Bid high, choose trumps, and win tricks.',
    minPlayers: 4,
    maxPlayers: 4,
    defaultEntryFees: [25, 50, 100, 250, 500],
    icon: '🎴',
    enabled: true,
  };

  public gameStates = new Map<string, InternalGameState>();
  public roomTimers = new Map<string, NodeJS.Timeout>();
  private queues = new Map<string, Promise<unknown>>();

  private enqueue<T>(roomId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(roomId) || Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    this.queues.set(roomId, next);
    void next.finally(() => { if (this.queues.get(roomId) === next) this.queues.delete(roomId); }).catch(() => {});
    return next;
  }

  validateCreateOptions(options: { entryFee: number; maxPlayers: number }): void {
    if (options.maxPlayers !== 4) {
      throw new Error('29 Card Game strictly requires 4 players (2 vs 2)');
    }
    if (options.entryFee <= 0) {
      throw new Error('Entry fee must be greater than zero');
    }
  }

  validateJoin(room: RoomWithPlayers, userId: string): void {
    if (room.players.length >= 4) {
      throw new Error('29 Card Game table is full (4/4 players)');
    }
    if (room.players.some(p => p.userId === userId)) {
      throw new Error('Already joined');
    }
  }

  async onPlayerJoined(room: RoomWithPlayers, _userId: string, io: Server | null): Promise<void> {
    if (room.players.length === 4 && (room.status === 'PLAYING' || room.status === 'WAITING')) {
      await this.startGame(room.id, io);
    }
  }

  async startGame(roomId: string, io: Server | null): Promise<void> {
    return this.enqueue(roomId, async () => {
      try { await this.initializeRoom(roomId, io); }
      catch (error) {
        // Joining has already committed the entry fee. Keep recovery alive without
        // exposing an unsaved deal or reporting the successful join as a failure.
        this.cleanupRoom(roomId);
        console.error('[TwentyNine] Initialization failed; retrying:', error);
        const retry = setTimeout(() => { void this.startGame(roomId, io); }, 3000);
        retry.unref?.(); this.roomTimers.set(roomId, retry);
      }
    });
  }

  private async initializeRoom(roomId: string, io: Server | null): Promise<void> {
    if (this.gameStates.has(roomId)) return;
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        players: {
          include: { user: { select: { id: true, username: true, displayName: true, avatar: true } } },
          orderBy: { seatIndex: 'asc' },
        },
      },
    });

    if (!room || room.players.length !== 4 || !['WAITING', 'PLAYING'].includes(room.status)) {
      this.cleanupRoom(roomId); return;
    }
    if (room.engineState) { await this.restoreRoom(roomId, io); return; }

    const playerOrder = room.players.map(p => p.userId);
    const players: Record<string, InternalPlayerState> = {};

    room.players.forEach((p, idx) => {
      const seat = p.seatIndex ?? idx;
      players[p.userId] = {
        userId: p.userId,
        username: p.user?.username || `Player ${seat + 1}`,
        displayName: (p.user as any)?.displayName || p.user?.username || `Player ${seat + 1}`,
        avatar: (p.user as any)?.avatar || 'avatar_1',
        seatIndex: seat,
        teamIndex: seat % 2 === 0 ? 0 : 1, // Seats 0 & 2 = Team 0; Seats 1 & 3 = Team 1
        cardCount: 0,
        cards: [],
        hasPassedBid: false,
        isDisconnected: false,
      };
    });

    this.dealHandAndStartAuction(roomId, room.entryFee, playerOrder, players, 0, io);
    const state = this.gameStates.get(roomId)!;
    Object.assign(state, { roomCode: room.roomCode, isPrivate: room.isPrivate, createdAt: room.createdAt.toISOString(), sequence: room.engineSequence });
    this.restoreConnections(state, io);
    this.gameStates.delete(roomId);
    const saved = await prisma.room.updateMany({
      where: { id: roomId, status: { in: ['WAITING', 'PLAYING'] }, engineState: null },
      data: { status: 'PLAYING', engineState: JSON.stringify(state), customConfig: JSON.stringify(publicRoomConfig(room.customConfig) || {}) },
    });
    if (saved.count !== 1) { this.cleanupRoom(roomId); throw new Error('Room changed while starting'); }
    this.gameStates.set(roomId, state);
    this.broadcastState(roomId, io);
    this.scheduleTurnTimer(roomId, io);
  }

  private dealHandAndStartAuction(
    roomId: string,
    entryFee: number,
    playerOrder: string[],
    players: Record<string, InternalPlayerState>,
    dealerSeatIndex: number,
    io: Server | null
  ) {
    this.clearTimer(roomId);

    const fullDeck = shuffleDeck(createTwentyNineDeck());

    // Phase 1: Deal 4 cards each to players in seat order
    for (const userId of playerOrder) {
      players[userId].cards = fullDeck.splice(0, 4);
      players[userId].cardCount = 4;
      players[userId].hasPassedBid = false;
    }

    // Dealer is seat 0 by default; first bidder is seat 1 (next to dealer, clockwise)
    const firstBidderSeat = (dealerSeatIndex + 1) % 4;
    const firstBidderId = playerOrder[firstBidderSeat];

    const gameState: InternalGameState = {
      roomId,
      roomCode: '', isPrivate: false, createdAt: '', sequence: 0,
      rulesVersion: 'single-deal-v1',
      entryFee,
      phase: 'BIDDING',
      dealerSeatIndex,
      currentTurnUserId: firstBidderId,
      currentTurnSeatIndex: firstBidderSeat,
      turnExpiresAt: Date.now() + TURN_TIMEOUT_MS,
      highestBid: 0,
      highestBidderUserId: null,
      highestBidderSeatIndex: null,
      contractorUserId: null,
      contractorTeamIndex: null,
      contract: 0,
      trumpSuit: null,
      isTrumpRevealed: false,
      trumpRevealedByUserId: null,
      trumpRevealedBySeatIndex: null,
      trumpRevealedAtTrickIndex: null,
      currentTrickIndex: 0,
      currentTrick: {
        trickIndex: 0,
        leadSuit: null,
        cards: [],
        points: 0,
      },
      previousTricks: [],
      team0Points: 0,
      team1Points: 0,
      deck: fullDeck, // Remaining 16 cards to be dealt after auction
      players,
      playerOrder,
    };

    this.gameStates.set(roomId, gameState);
  }

  async handleAction(roomId: string, userId: string, action: string, payload: any, io: Server | null): Promise<ActionResult> {
    return this.enqueue(roomId, () => this.applyAction(roomId, userId, action, payload, io));
  }

  private async applyAction(roomId: string, userId: string, action: string, payload: any, io: Server | null): Promise<ActionResult> {
    const game = this.gameStates.get(roomId);
    if (!game || !game.players[userId]) return { success: false, message: 'Game or player not found' };
    const fingerprint = JSON.stringify({ action, payload });
    if (payload?.actionId && game.lastAction && game.lastAction.id === payload.actionId) {
      const same = game.lastAction.userId === userId && game.lastAction.fingerprint === fingerprint;
      return { success: same, message: same ? 'Action already applied' : 'Action ID already used', sequence: game.sequence };
    }
    if (payload?.expectedSequence !== undefined && payload.expectedSequence !== game.sequence) {
      return { success: false, message: 'Table changed. Refresh before acting.', sequence: game.sequence };
    }
    if (game.phase === 'SETTLING' || game.phase === 'COMPLETED') return { success: false, message: 'Deal has finished' };
    const before = structuredClone(game);
    this.clearTimer(roomId);
    try {
      let result: ActionResult;
      switch (action) {
        case 'BID': result = this.handleBid(game, userId, Number(payload?.amount), io); break;
        case 'PASS': result = this.handlePass(game, userId, io); break;
        case 'SELECT_TRUMP': result = this.handleSelectTrump(game, userId, payload?.suit, io); break;
        case 'REVEAL_TRUMP': result = this.handleRevealTrump(game, userId, io); break;
        case 'PLAY_CARD': result = await this.handlePlayCard(game, userId, payload?.card, io); break;
        default: result = { success: false, message: `Unknown action: ${action}` };
      }
      if (!result.success) { this.scheduleTurnTimer(roomId, io); return result; }
      // An all-pass redeal replaces the state. Never persist the discarded deal.
      const current = this.gameStates.get(roomId)!;
      Object.assign(current, { roomCode: before.roomCode, isPrivate: before.isPrivate, createdAt: before.createdAt, sequence: before.sequence + 1 });
      current.disconnectedSince = before.disconnectedSince;
      current.graceUsed = before.graceUsed || {};
      if (current.currentTurnUserId && current.players[current.currentTurnUserId].isDisconnected && !current.graceUsed[current.currentTurnUserId]) {
        current.turnExpiresAt = Math.max(current.turnExpiresAt || 0, Date.now() + 30000);
        current.graceUsed[current.currentTurnUserId] = true;
      }
      if (payload?.actionId) current.lastAction = { id: payload.actionId, userId, fingerprint };
      this.gameStates.set(roomId, before);
      await this.persistState(current, before.sequence);
      this.gameStates.set(roomId, current);
      this.broadcastState(roomId, io);
      if (current.phase === 'SETTLING') await this.finishGame(current, io);
      else this.scheduleTurnTimer(roomId, io);
      return { ...result, sequence: current.sequence };
    } catch (error) {
      // A committed SETTLING checkpoint must survive settlement failures.
      const saved = await prisma.room.findUnique({ where: { id: roomId }, select: { status: true, engineState: true } }).catch(() => null);
      if (saved && saved.status !== 'PLAYING') { this.cleanupRoom(roomId); throw error; }
      if (saved?.engineState) this.gameStates.set(roomId, JSON.parse(saved.engineState));
      else this.gameStates.set(roomId, before);
      const current = this.gameStates.get(roomId)!;
      if (current.phase === 'SETTLING') this.scheduleSettlementRetry(current, io);
      else this.scheduleTurnTimer(roomId, io);
      throw error;
    }
  }

  // ─── Bidding Phase Logic ───────────────────────────────────────────────────

  private handleBid(
    game: InternalGameState,
    userId: string,
    amount: number,
    io: Server | null
  ): ActionResult {
    if (game.phase !== 'BIDDING') {
      return { success: false, message: 'Auction is not active' };
    }
    if (game.currentTurnUserId !== userId) {
      return { success: false, message: 'Not your turn to bid' };
    }
    if (!Number.isInteger(amount) || amount < MIN_BID || amount > MAX_BID) {
      return { success: false, message: `Bid must be an integer between ${MIN_BID} and ${MAX_BID}` };
    }
    if (amount <= game.highestBid) {
      return { success: false, message: `Bid must be strictly higher than current highest bid (${game.highestBid})` };
    }

    const player = game.players[userId];
    game.highestBid = amount;
    game.highestBidderUserId = userId;
    game.highestBidderSeatIndex = player.seatIndex;

    this.advanceBiddingTurn(game, io);
    return { success: true, message: `Bid placed: ${amount}` };
  }

  private handlePass(
    game: InternalGameState,
    userId: string,
    io: Server | null
  ): ActionResult {
    if (game.phase !== 'BIDDING') {
      return { success: false, message: 'Auction is not active' };
    }
    if (game.currentTurnUserId !== userId) {
      return { success: false, message: 'Not your turn to pass' };
    }

    const player = game.players[userId];
    player.hasPassedBid = true;

    this.advanceBiddingTurn(game, io);
    return { success: true, message: 'Passed bid' };
  }

  private advanceBiddingTurn(game: InternalGameState, io: Server | null) {
    const activeBidders = game.playerOrder.filter(uid => !game.players[uid].hasPassedBid);

    // Case 1: All 4 players passed without any bid -> All-pass redeal!
    if (activeBidders.length === 0 && game.highestBid === 0) {
      const nextDealerSeat = (game.dealerSeatIndex + 1) % 4;
      this.dealHandAndStartAuction(
        game.roomId,
        game.entryFee,
        game.playerOrder,
        game.players,
        nextDealerSeat,
        io
      );
      return;
    }

    // Case 2: Only 1 active bidder remains and a bid was made -> Auction won!
    if (activeBidders.length === 1 && game.highestBid >= MIN_BID) {
      const contractorId = activeBidders[0];
      const contractor = game.players[contractorId];

      game.phase = 'TRUMP_SELECTION';
      game.contractorUserId = contractorId;
      game.contractorTeamIndex = contractor.teamIndex;
      game.contract = game.highestBid;
      game.currentTurnUserId = contractorId;
      game.currentTurnSeatIndex = contractor.seatIndex;
      game.turnExpiresAt = Date.now() + TURN_TIMEOUT_MS;


      return;
    }

    // Advance to next active bidder clockwise
    let nextSeat = (game.currentTurnSeatIndex! + 1) % 4;
    while (game.players[game.playerOrder[nextSeat]].hasPassedBid) {
      nextSeat = (nextSeat + 1) % 4;
    }

    const nextUserId = game.playerOrder[nextSeat];
    game.currentTurnUserId = nextUserId;
    game.currentTurnSeatIndex = nextSeat;
    game.turnExpiresAt = Date.now() + TURN_TIMEOUT_MS;


  }

  // ─── Trump Selection Logic ─────────────────────────────────────────────────

  private handleSelectTrump(
    game: InternalGameState,
    userId: string,
    suit: CardSuit,
    io: Server | null
  ): ActionResult {
    if (game.phase !== 'TRUMP_SELECTION') {
      return { success: false, message: 'Trump selection is not active' };
    }
    if (game.contractorUserId !== userId) {
      return { success: false, message: 'Only the winning contractor can choose trump' };
    }
    if (!TWENTY_NINE_SUITS.includes(suit)) {
      return { success: false, message: `Invalid trump suit: ${suit}` };
    }

    game.trumpSuit = suit;
    game.isTrumpRevealed = false;

    // Deal Phase 2: Deal remaining 16 cards (4 more to each player)
    for (const uid of game.playerOrder) {
      const secondBatch = game.deck.splice(0, 4);
      game.players[uid].cards.push(...secondBatch);
      game.players[uid].cardCount = 8;
    }

    // Move to trick-taking phase
    game.phase = 'PLAYING';
    game.currentTrickIndex = 0;
    game.currentTrick = {
      trickIndex: 0,
      leadSuit: null,
      cards: [],
      points: 0,
    };

    // Contractor leads the first trick
    game.currentTurnUserId = game.contractorUserId;
    game.currentTurnSeatIndex = game.players[game.contractorUserId].seatIndex;
    game.turnExpiresAt = Date.now() + TURN_TIMEOUT_MS;


    return { success: true, message: `Trump selected: ${suit}` };
  }

  // ─── Trump Reveal Logic ────────────────────────────────────────────────────

  private handleRevealTrump(
    game: InternalGameState,
    userId: string,
    io: Server | null
  ): ActionResult {
    if (game.phase !== 'PLAYING') {
      return { success: false, message: 'Trick play is not active' };
    }
    if (game.currentTurnUserId !== userId) {
      return { success: false, message: 'Not your turn to reveal trump' };
    }
    if (game.isTrumpRevealed) {
      return { success: false, message: 'Trump is already revealed' };
    }
    if (!game.currentTrick.leadSuit) {
      return { success: false, message: 'Cannot reveal trump when leading a trick' };
    }

    const player = game.players[userId];
    const hasLeadSuit = player.cards.some(c => c.suit === game.currentTrick.leadSuit);
    if (hasLeadSuit) {
      return { success: false, message: 'You must follow the lead suit and cannot reveal trump' };
    }

    game.isTrumpRevealed = true;
    game.trumpRevealedByUserId = userId;
    game.trumpRevealedBySeatIndex = player.seatIndex;
    game.trumpRevealedAtTrickIndex = game.currentTrickIndex;

    return { success: true, message: `Trump revealed: ${game.trumpSuit}` };
  }

  // ─── Trick Card Play Logic ─────────────────────────────────────────────────

  private async handlePlayCard(
    game: InternalGameState,
    userId: string,
    card: PlayingCard,
    io: Server | null
  ): Promise<ActionResult> {
    if (game.phase !== 'PLAYING') {
      return { success: false, message: 'Trick play is not active' };
    }
    if (game.currentTurnUserId !== userId) {
      return { success: false, message: 'Not your turn to play a card' };
    }
    if (!card || !card.suit || (!card.label && card.rank === undefined)) {
      return { success: false, message: 'Invalid card payload' };
    }

    const rankStr = String(card.rank ?? '').toUpperCase();
    const labelStr = String(card.label ?? '').toUpperCase();

    const RANK_MAP: Record<string, { label: string; rank: number }> = {
      '7': { label: '7', rank: 7 },
      'SEVEN': { label: '7', rank: 7 },
      '8': { label: '8', rank: 8 },
      'EIGHT': { label: '8', rank: 8 },
      '9': { label: '9', rank: 9 },
      'NINE': { label: '9', rank: 9 },
      '10': { label: '10', rank: 10 },
      'TEN': { label: '10', rank: 10 },
      '11': { label: 'J', rank: 11 },
      'J': { label: 'J', rank: 11 },
      'JACK': { label: 'J', rank: 11 },
      '12': { label: 'Q', rank: 12 },
      'Q': { label: 'Q', rank: 12 },
      'QUEEN': { label: 'Q', rank: 12 },
      '13': { label: 'K', rank: 13 },
      'K': { label: 'K', rank: 13 },
      'KING': { label: 'K', rank: 13 },
      '14': { label: 'A', rank: 14 },
      'A': { label: 'A', rank: 14 },
      'ACE': { label: 'A', rank: 14 },
    };

    const resolved = RANK_MAP[labelStr] || RANK_MAP[rankStr];
    if (!resolved) {
      return { success: false, message: 'Invalid card payload' };
    }

    const player = game.players[userId];
    const cardIndex = player.cards.findIndex(
      c => c.suit === card.suit && (c.label === resolved.label || c.rank === resolved.rank)
    );
    if (cardIndex === -1) {
      return { success: false, message: 'Card is not in your hand' };
    }

    const selectedCard = player.cards[cardIndex];
    const legalCards = this.getLegalCards(game, userId);
    const isLegal = legalCards.some(
      c => c.suit === selectedCard.suit && (c.label === selectedCard.label || c.rank === selectedCard.rank)
    );
    if (!isLegal) {
      return { success: false, message: 'Illegal card play according to suit/trump rules' };
    }

    // Remove card from player hand
    player.cards.splice(cardIndex, 1);
    player.cardCount = player.cards.length;

    // Check if card is an effective trump card
    const isTrump = game.isTrumpRevealed && selectedCard.suit === game.trumpSuit;

    // If trick has no lead suit yet, this card sets the lead suit
    if (!game.currentTrick.leadSuit) {
      game.currentTrick.leadSuit = selectedCard.suit;
    }

    const trickCard: TwentyNineTrickCard = {
      userId,
      seatIndex: player.seatIndex,
      card: selectedCard,
      isTrump,
    };
    game.currentTrick.cards.push(trickCard);
    game.currentTrick.points += getCardPoints(selectedCard);

    // If 4 cards played in trick, resolve trick
    if (game.currentTrick.cards.length === 4) {
      await this.resolveCurrentTrick(game, io);
    } else {
      // Advance to next clockwise player
      const nextSeat = (player.seatIndex + 1) % 4;
      const nextUserId = game.playerOrder[nextSeat];
      game.currentTurnUserId = nextUserId;
      game.currentTurnSeatIndex = nextSeat;
      game.turnExpiresAt = Date.now() + TURN_TIMEOUT_MS;


    }

    return { success: true, message: 'Card played' };
  }

  private async resolveCurrentTrick(game: InternalGameState, io: Server | null): Promise<void> {
    this.clearTimer(game.roomId);

    const trick = game.currentTrick;
    let winningCardIndex = 0;
    let highestPower = -1;

    // Check if any trump cards played in trick
    const hasTrumpCard = trick.cards.some(c => c.isTrump);

    if (hasTrumpCard) {
      // Highest trump card wins trick
      trick.cards.forEach((tc, idx) => {
        if (tc.isTrump) {
          const power = getCardPower(tc.card);
          if (power > highestPower) {
            highestPower = power;
            winningCardIndex = idx;
          }
        }
      });
    } else {
      // Highest card of lead suit wins trick
      trick.cards.forEach((tc, idx) => {
        if (tc.card.suit === trick.leadSuit) {
          const power = getCardPower(tc.card);
          if (power > highestPower) {
            highestPower = power;
            winningCardIndex = idx;
          }
        }
      });
    }

    const winningTrickCard = trick.cards[winningCardIndex];
    const winnerPlayer = game.players[winningTrickCard.userId];

    trick.winnerUserId = winnerPlayer.userId;
    trick.winnerSeatIndex = winnerPlayer.seatIndex;
    trick.winnerTeamIndex = winnerPlayer.teamIndex;

    // Award trick points to winner's team
    if (winnerPlayer.teamIndex === 0) {
      game.team0Points += trick.points;
    } else {
      game.team1Points += trick.points;
    }

    game.previousTricks.push({ ...trick });

    // Check if 8 tricks are completed
    if (game.currentTrickIndex >= 7) {
      game.phase = 'SETTLING';
      game.currentTurnUserId = null;
      game.currentTurnSeatIndex = null;
      game.turnExpiresAt = null;
    } else {
      // Start next trick with winner leading
      game.currentTrickIndex++;
      game.currentTrick = {
        trickIndex: game.currentTrickIndex,
        leadSuit: null,
        cards: [],
        points: 0,
      };
      game.currentTurnUserId = winnerPlayer.userId;
      game.currentTurnSeatIndex = winnerPlayer.seatIndex;
      game.turnExpiresAt = Date.now() + TURN_TIMEOUT_MS;


    }
  }

  // ─── Settlement & Game Finish Logic ────────────────────────────────────────

  async finishGame(game: InternalGameState, io: Server | null): Promise<void> {
    this.clearTimer(game.roomId);
    game.currentTurnUserId = null;
    game.currentTurnSeatIndex = null;
    game.turnExpiresAt = null;

    try {
    // Check if contractor reached the contract
    const contractorTeam = game.contractorTeamIndex!;
    const contractorPoints = contractorTeam === 0 ? game.team0Points : game.team1Points;
    const isContractMet = contractorPoints >= game.contract;

    const winningTeamIndex = isContractMet ? contractorTeam : (contractorTeam === 0 ? 1 : 0);
    game.winningTeamIndex = winningTeamIndex;

    const winningPlayers = game.playerOrder
      .map(uid => game.players[uid])
      .filter(p => p.teamIndex === winningTeamIndex);

    const winningUserIds = winningPlayers.map(p => p.userId);
    game.winningUserIds = winningUserIds;

    const totalPoolPaise = toPaise(game.entryFee) * 4;
    const totalPool = totalPoolPaise / 100;
    const commissionPercent = await getEffectiveCommissionPercent();
    const commissionPaise = Math.round((totalPoolPaise * commissionPercent) / 100);
    const distributablePoolPaise = totalPoolPaise - commissionPaise;

    // Deterministic odd paise allocation: seat with lowest index gets the +1 paise
    const halfBasePaise = Math.floor(distributablePoolPaise / 2);
    const hasOddPaise = distributablePoolPaise % 2 !== 0;

    const sortedWinners = [...winningPlayers].sort((a, b) => a.seatIndex - b.seatIndex);
    const payout1Paise = halfBasePaise + (hasOddPaise ? 1 : 0);
    const payout2Paise = halfBasePaise;
    const prize1 = payout1Paise / 100;
    const prize2 = payout2Paise / 100;
    game.payouts = [{ userId: sortedWinners[0].userId, amount: prize1 }, { userId: sortedWinners[1].userId, amount: prize2 }];
    game.winnerPrizePerPlayer = prize2; // Nominal half prize

    const explanation = isContractMet
      ? `Contractor's Team ${contractorTeam} reached contract (${contractorPoints}/${game.contract} pts) and won!`
      : `Defending Team ${winningTeamIndex} defended successfully (Contractor got ${contractorPoints}/${game.contract} pts) and won!`;
    game.explanation = explanation;

      const settled = await serializable(async tx => {
        const room = await tx.room.findUnique({
          where: { id: game.roomId },
          include: { players: true },
        });

        if (!room || room.status === 'CANCELLED') return false;
        if (room.status === 'COMPLETED') return 'ALREADY' as const;
        const locked = await tx.room.updateMany({ where: { id: game.roomId, status: 'PLAYING' }, data: { status: 'PLAYING' } });
        if (locked.count !== 1) return false;

        // Release locked entries for all 4 players
        for (const p of room.players) {
          await moveWallet(tx, p.userId, 0, -game.entryFee);
        }

        // Credit each winner
        await moveWallet(tx, sortedWinners[0].userId, prize1);
        await tx.transaction.create({
          data: {
            userId: sortedWinners[0].userId,
            amount: prize1,
            type: 'ROOM_WIN',
            idempotencyKey: `room-win-29:${game.roomId}:${sortedWinners[0].userId}`,
            referenceId: game.roomId,
            description: `Won 29 Card Game Table #${room.roomCode} (Team ${winningTeamIndex}). Payout: ₹${prize1.toFixed(2)}`,
          },
        });

        await moveWallet(tx, sortedWinners[1].userId, prize2);
        await tx.transaction.create({
          data: {
            userId: sortedWinners[1].userId,
            amount: prize2,
            type: 'ROOM_WIN',
            idempotencyKey: `room-win-29:${game.roomId}:${sortedWinners[1].userId}`,
            referenceId: game.roomId,
            description: `Won 29 Card Game Table #${room.roomCode} (Team ${winningTeamIndex}). Payout: ₹${prize2.toFixed(2)}`,
          },
        });

        const customConfigObj = {
          gameType: 'TWENTY_NINE',
          rulesVersion: 'single-deal-v1',
          settledPool: totalPool,
          platformCommission: commissionPaise / 100,
          distributablePool: distributablePoolPaise / 100,
          contract: game.contract,
          contractorUserId: game.contractorUserId,
          contractorTeamIndex: game.contractorTeamIndex,
          winningTeamIndex,
          winnerUserIds: winningUserIds,
          team0Points: game.team0Points,
          team1Points: game.team1Points,
          payouts: [
            { userId: sortedWinners[0].userId, amount: prize1 },
            { userId: sortedWinners[1].userId, amount: prize2 },
          ],
          explanation,
          settledAt: new Date().toISOString(),
        };

        await tx.room.update({
          where: { id: game.roomId },
          data: {
            status: 'COMPLETED',
            winnerId: sortedWinners[0].userId,
            winnerPrize: (payout1Paise + payout2Paise) / 100,
            customConfig: JSON.stringify(customConfigObj),
            engineState: JSON.stringify({ ...game, phase: 'COMPLETED' }),
          },
        });
        return true;
      });

      if (!settled) { this.cleanupRoom(game.roomId); return; }
      // ONLY mark COMPLETED upon successful DB settlement!
      game.phase = 'COMPLETED';

      if (settled === 'ALREADY') return;
      // Send notifications & update wallet sockets
      for (const p of sortedWinners) {
        void notificationService.create({
          userId: p.userId,
          title: '29 Card Game Victory!',
          message: `Your team won Table #${game.roomId.slice(-6)}! ₹${(p.userId === sortedWinners[0].userId ? prize1 : prize2).toFixed(2)} credited to your wallet.`,
          type: 'ROOM_WIN',
          metadata: { roomId: game.roomId, winningTeamIndex },
        }).catch(() => {});
      }

      for (const uid of game.playerOrder) {
        const wallet = await walletService.getWallet(uid).catch(() => null);
        io?.to(`user:${uid}`).emit('wallet_updated', wallet);
        io?.to(`user:${uid}`).emit('balance_updated', wallet);
      }

      this.broadcastState(game.roomId, io);
      io?.to(`room:${game.roomId}`).emit('game_finished', {
        roomId: game.roomId,
        winnerUserIds: winningUserIds,
        winningTeamIndex,
        explanation,
      });
    } catch (err: any) {
      console.error(`[TwentyNine] Settlement error for room ${game.roomId}:`, err?.message || err);
      this.scheduleSettlementRetry(game, io);
    }
  }

  // ─── Legal Card Evaluation ─────────────────────────────────────────────────

  getLegalCards(game: InternalGameState, userId: string): PlayingCard[] {
    const player = game.players[userId];
    if (!player || player.cards.length === 0) return [];
    if (game.phase !== 'PLAYING') return [];

    const leadSuit = game.currentTrick.leadSuit;

    // If player is leading the trick, any card is legal
    if (!leadSuit) {
      return [...player.cards];
    }

    // Follow-suit rule: If player has cards of leadSuit, MUST play leadSuit
    const cardsOfLeadSuit = player.cards.filter(c => c.suit === leadSuit);
    if (cardsOfLeadSuit.length > 0) {
      return cardsOfLeadSuit;
    }

    // Player cannot follow suit:
    // If trump was just revealed this turn by this player: MUST play trump if holding any trump
    if (
      game.isTrumpRevealed &&
      game.trumpRevealedByUserId === userId &&
      game.trumpRevealedAtTrickIndex === game.currentTrickIndex &&
      game.currentTrick.cards.length > 0 &&
      game.currentTrick.cards[game.currentTrick.cards.length - 1].userId !== userId
    ) {
      const trumpCards = player.cards.filter(c => c.suit === game.trumpSuit);
      if (trumpCards.length > 0) {
        return trumpCards;
      }
    }

    // Otherwise, any card is legal
    return [...player.cards];
  }

  // ─── Sanitization & Anti-Cheat ─────────────────────────────────────────────

  getClientState(roomId: string, forUserId?: string): TwentyNineGameState | null {
    const game = this.gameStates.get(roomId);
    if (!game) return null;

    const sanitizedPlayers: Record<string, TwentyNinePlayerState> = {};

    for (const [uid, p] of Object.entries(game.players)) {
      const isSelf = uid === forUserId;
      const isGameOver = game.phase === 'COMPLETED';

      sanitizedPlayers[uid] = {
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
        avatar: p.avatar,
        seatIndex: p.seatIndex,
        teamIndex: p.teamIndex,
        cardCount: p.cards.length,
        hasPassedBid: p.hasPassedBid,
        isDisconnected: p.isDisconnected,
        // Send actual cards only for the authenticated player or at showdown
        cards: isSelf || isGameOver ? [...p.cards] : undefined,
        legalCards: isSelf && game.currentTurnUserId === uid ? this.getLegalCards(game, uid) : undefined,
      };
    }

    // Anti-cheat: Trump suit is masked from opponents until revealed
    let clientTrumpSuit: CardSuit | null = null;
    if (game.isTrumpRevealed || game.phase === 'COMPLETED') {
      clientTrumpSuit = game.trumpSuit;
    } else if (forUserId && forUserId === game.contractorUserId) {
      clientTrumpSuit = game.trumpSuit;
    }

    // Convenience flag: whether current player can reveal trump
    let canRevealTrump = false;
    if (
      forUserId &&
      game.phase === 'PLAYING' &&
      game.currentTurnUserId === forUserId &&
      !game.isTrumpRevealed &&
      game.currentTrick.leadSuit !== null
    ) {
      const player = game.players[forUserId];
      const hasLeadSuit = player.cards.some(c => c.suit === game.currentTrick.leadSuit);
      canRevealTrump = !hasLeadSuit;
    }

    return {
      roomId: game.roomId,
      sequence: game.sequence,
      phase: game.phase,
      rulesVersion: game.rulesVersion,
      dealerSeatIndex: game.dealerSeatIndex,
      currentTurnUserId: game.currentTurnUserId,
      currentTurnSeatIndex: game.currentTurnSeatIndex,
      turnExpiresAt: game.turnExpiresAt,
      highestBid: game.highestBid,
      highestBidderUserId: game.highestBidderUserId,
      highestBidderSeatIndex: game.highestBidderSeatIndex,
      contractorUserId: game.contractorUserId,
      contractorTeamIndex: game.contractorTeamIndex,
      contract: game.contract,
      trumpSuit: clientTrumpSuit,
      isTrumpRevealed: game.isTrumpRevealed,
      trumpRevealedByUserId: game.trumpRevealedByUserId,
      trumpRevealedBySeatIndex: game.trumpRevealedBySeatIndex,
      trumpRevealedAtTrickIndex: game.trumpRevealedAtTrickIndex,
      canRevealTrump,
      currentTrickIndex: game.currentTrickIndex,
      currentTrick: {
        trickIndex: game.currentTrick.trickIndex,
        leadSuit: game.currentTrick.leadSuit,
        cards: game.currentTrick.cards.map(c => ({
          userId: c.userId,
          seatIndex: c.seatIndex,
          card: c.card,
          isTrump: c.isTrump,
        })),
        points: game.currentTrick.points,
      },
      previousTricks: game.previousTricks,
      team0Points: game.team0Points,
      team1Points: game.team1Points,
      players: sanitizedPlayers,
      winningTeamIndex: game.winningTeamIndex,
      winningUserIds: game.winningUserIds,
      winnerPrizePerPlayer: game.winnerPrizePerPlayer,
      payouts: game.payouts,
      explanation: game.explanation,
    };
  }

  broadcastState(roomId: string, io: Server | null) {
    const game = this.gameStates.get(roomId);
    if (!io || !game) return;
    // Participants receive only their own state; observers receive the masked view.
    const participantChannels = game.playerOrder.map(uid => `user:${uid}`);
    io.to(`room:${roomId}`).except(participantChannels).emit('twenty_nine_state', this.getClientState(roomId));
    io.to(`room:${roomId}`).emit('room_updated', {
      id: roomId, roomCode: game.roomCode, isPrivate: game.isPrivate,
      gameType: 'TWENTY_NINE', entryFee: game.entryFee, maxPlayers: 4,
      createdAt: game.createdAt, status: game.phase === 'COMPLETED' ? 'COMPLETED' : 'PLAYING',
      players: game.playerOrder.map(uid => {
        const p = game.players[uid];
        return { id: `${roomId}-${uid}`, roomId, userId: uid, seatIndex: p.seatIndex, status: 'ACTIVE',
          user: { id: uid, username: p.username, displayName: p.displayName, avatar: p.avatar } };
      }),
    });
    for (const uid of game.playerOrder) io.to(`user:${uid}`).emit('twenty_nine_state', this.getClientState(roomId, uid));
  }

  async persistState(game: InternalGameState, previousSequence: number): Promise<void> {
    const saved = await prisma.room.updateMany({
      where: { id: game.roomId, status: 'PLAYING', engineSequence: previousSequence },
      data: { engineState: JSON.stringify(game), engineSequence: game.sequence },
    });
    if (saved.count !== 1) throw new Error('Room changed or was cancelled; refresh the table');
  }

  async restoreRoom(roomId: string, io: Server | null): Promise<boolean> {
    const room = await prisma.room.findUnique({ where: { id: roomId }, include: { players: true } });
    if (!room || !['PLAYING', 'COMPLETED'].includes(room.status)) return false;
    let state: InternalGameState;
    try {
      state = room.engineState ? JSON.parse(room.engineState) : JSON.parse(room.customConfig || '{}').twentyNineState;
      if (!state || state.roomId !== roomId || state.playerOrder?.length !== 4 ||
          state.playerOrder.some(uid => !room.players.some(p => p.userId === uid))) return false;
      const cards = [...(state.deck || []), ...Object.values(state.players).flatMap(p => p.cards),
        ...state.previousTricks.flatMap(t => t.cards.map(c => c.card))];
      // The final trick is also in previousTricks once settlement begins.
      if (state.phase !== 'SETTLING' && state.phase !== 'COMPLETED') cards.push(...state.currentTrick.cards.map(c => c.card));
      if (cards.length !== 32 || new Set(cards.map(c => `${c.suit}:${c.rank}`)).size !== 32) return false;
    } catch { return false; }
    Object.assign(state, { roomCode: room.roomCode, isPrivate: room.isPrivate, createdAt: room.createdAt.toISOString(), sequence: room.engineSequence });
    if (room.status === 'COMPLETED') state.phase = 'COMPLETED';
    this.restoreConnections(state, io);
    // Migrate old snapshots without returning them to clients.
    await prisma.room.update({ where: { id: roomId }, data: {
      engineState: JSON.stringify(state), customConfig: JSON.stringify(publicRoomConfig(room.customConfig) || {}),
    } });
    this.gameStates.set(roomId, state);
    this.broadcastState(roomId, io);
    if (state.phase === 'SETTLING') this.scheduleSettlementRetry(state, io);
    else if (state.phase !== 'COMPLETED') this.scheduleTurnTimer(roomId, io);
    return true;
  }

  private restoreConnections(state: InternalGameState, io: Server | null) {
    if (!io?.sockets?.adapter || ['SETTLING', 'COMPLETED'].includes(state.phase)) return;
    state.disconnectedSince ||= {}; state.graceUsed ||= {};
    for (const uid of state.playerOrder) {
      const connected = Boolean(io.sockets.adapter.rooms.get(`user:${uid}`)?.size);
      state.players[uid].isDisconnected = !connected;
      if (connected) delete state.disconnectedSince[uid];
      else {
        state.disconnectedSince[uid] ??= Date.now();
        if (state.currentTurnUserId === uid && !state.graceUsed[uid]) {
          state.turnExpiresAt = Math.max(state.turnExpiresAt || 0, Date.now() + 30000);
          state.graceUsed[uid] = true;
        }
      }
    }
  }

  private scheduleSettlementRetry(game: InternalGameState, io: Server | null) {
    this.clearTimer(game.roomId);
    if (!this.gameStates.has(game.roomId)) return;
    const timer = setTimeout(() => {
      void this.enqueue(game.roomId, async () => {
        const current = this.gameStates.get(game.roomId);
        if (current?.phase === 'SETTLING') await this.finishGame(current, io);
      }).catch(error => { console.error('[TwentyNine] Retry failed:', error.message); this.scheduleSettlementRetry(game, io); });
    }, 3000);
    timer.unref?.();
    this.roomTimers.set(game.roomId, timer);
  }

  private scheduleTurnTimer(roomId: string, io: Server | null) {
    this.clearTimer(roomId);
    const game = this.gameStates.get(roomId);
    if (!game?.currentTurnUserId || game.phase === 'COMPLETED' || game.phase === 'SETTLING') return;
    const sequence = game.sequence;
    const timer = setTimeout(() => {
      void this.enqueue(roomId, async () => {
        const current = this.gameStates.get(roomId);
        if (!current || current.sequence !== sequence) return;
        await this.handleTurnTimeout(roomId, io);
      }).catch(error => {
        console.error('[TwentyNine] Timeout failed:', error.message);
        const retry = setTimeout(() => this.scheduleTurnTimer(roomId, io), 3000);
        retry.unref?.(); this.roomTimers.set(roomId, retry);
      });
    }, Math.max(1, (game.turnExpiresAt || Date.now()) - Date.now()));
    timer.unref?.();
    this.roomTimers.set(roomId, timer);
  }

  private async handleTurnTimeout(roomId: string, io: Server | null) {
    const game = this.gameStates.get(roomId);
    if (!game?.currentTurnUserId) return;
    const actorId = game.currentTurnUserId;
    const offline = game.playerOrder.map(uid => game.disconnectedSince?.[uid]);
    if (offline.every(time => typeof time === 'number') && Date.now() - Math.max(...offline as number[]) >= 300000) {
      await serializable(async tx => {
        const cancelled = await tx.room.updateMany({ where: { id: roomId, status: 'PLAYING' }, data: { status: 'CANCELLED', engineState: null } });
        if (cancelled.count !== 1) return;
        for (const uid of game.playerOrder) {
          await moveWallet(tx, uid, game.entryFee, -game.entryFee);
          await tx.transaction.create({ data: { userId: uid, amount: game.entryFee, type: 'REFUND', referenceId: roomId,
            idempotencyKey: `room-refund:${roomId}:${uid}`, description: '29 table abandoned: all players offline for five minutes' } });
        }
      });
      this.cleanupRoom(roomId);
      io?.to(`room:${roomId}`).emit('room_cancelled', { roomId, reason: 'All players offline for five minutes; entries refunded' });
      io?.to(`room:${roomId}`).emit('room_updated', {id: roomId, status: 'CANCELLED'});
      for (const uid of game.playerOrder) {
        const wallet = await walletService.getWallet(uid);
        io?.to(`user:${uid}`).emit('wallet_updated', wallet);
      }
      return;
    }
    let action: string;
    let payload: any = { expectedSequence: game.sequence };
    if (game.phase === 'BIDDING') action = 'PASS';
    else if (game.phase === 'TRUMP_SELECTION') {
      action = 'SELECT_TRUMP';
      payload.suit = [...TWENTY_NINE_SUITS].sort((a, b) =>
        game.players[actorId].cards.filter(c => c.suit === b).length - game.players[actorId].cards.filter(c => c.suit === a).length)[0];
    } else if (game.phase === 'PLAYING') { action = 'PLAY_CARD'; payload.card = this.getLegalCards(game, actorId)[0]; }
    else return;
    await this.applyAction(roomId, actorId, action, payload, io);
  }

  async setConnected(userId: string, connected: boolean, io: Server | null): Promise<void> {
    for (const [roomId, game] of this.gameStates) {
      if (!game.players[userId] || ['SETTLING', 'COMPLETED'].includes(game.phase)) continue;
      await this.enqueue(roomId, async () => {
        const current = this.gameStates.get(roomId);
        if (!current || current.players[userId].isDisconnected === !connected) return;
        const next = structuredClone(current);
        next.players[userId].isDisconnected = !connected;
        next.disconnectedSince ||= {}; next.graceUsed ||= {};
        if (connected) delete next.disconnectedSince[userId];
        else {
          next.disconnectedSince[userId] = Date.now();
          if (next.currentTurnUserId === userId && !next.graceUsed[userId]) {
            next.turnExpiresAt = Math.max(next.turnExpiresAt || 0, Date.now() + 30000);
            next.graceUsed[userId] = true;
          }
        }
        next.sequence++;
        await this.persistState(next, current.sequence);
        this.gameStates.set(roomId, next);
        this.broadcastState(roomId, io); this.scheduleTurnTimer(roomId, io);
      });
    }
  }

  private clearTimer(roomId: string) {
    const timer = this.roomTimers.get(roomId);
    if (timer) { clearTimeout(timer); this.roomTimers.delete(roomId); }
  }
  cleanupRoom(roomId: string): void { this.clearTimer(roomId); this.gameStates.delete(roomId); }
  stopAllTimers(): void { for (const timer of this.roomTimers.values()) clearTimeout(timer); this.roomTimers.clear(); }
}
export const twentyNineEngine = new TwentyNineEngine();
