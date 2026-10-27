export type GameType = 'GUESS_NUMBER' | 'TEEN_PATTI' | 'TWENTY_NINE' | 'SPORTS_MATCH';

export type RoomStatus = 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'ROLLING' | 'COMPLETED' | 'CANCELLED';

export interface GameDescriptor {
  id: GameType;
  name: string;
  tagline: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  defaultEntryFees: number[];
  icon: string;
  enabled: boolean;
}

export interface RoomPlayerDTO {
  id: string;
  roomId: string;
  userId: string;
  seatIndex: number;
  status: string;
  guessNumber?: number | null;
  joinedAt: string | Date;
  user?: {
    username: string;
  };
}

export interface RoomDTO {
  id: string;
  roomCode: string;
  invitationToken?: string | null;
  isPrivate?: boolean;
  gameType: GameType;
  entryFee: number;
  maxPlayers: number;
  status: RoomStatus;
  winningNumber?: number | null;
  winnerId?: string | null;
  winnerPrize?: number | null;
  customConfig?: Record<string, any> | null;
  gameState?: Record<string, any> | null;
  winner?: {
    username: string;
  } | null;
  players: RoomPlayerDTO[];
  createdAt: string | Date;
}

export interface CreateRoomDTO {
  userId: string;
  gameType?: GameType;
  entryFee: number;
  maxPlayers: number;
  isPrivate?: boolean;
  guessNumber?: number;
  customConfig?: Record<string, any>;
}

export interface JoinRoomDTO {
  userId: string;
  roomCode?: string;
  invitationToken?: string;
  guessNumber?: number;
  seatIndex?: number;
}

export interface RoomPreviewDTO {
  rulesVersion?: string;
  rulesSummary?: string;
  takenNumbers?: number[];
  teams?: string[];
  id: string;
  roomCode: string;
  invitationToken: string;
  gameType: GameType;
  entryFee: number;
  maxPlayers: number;
  occupiedSeats: number;
  status: RoomStatus;
  isPrivate: boolean;
  host: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
  };
  available: boolean;
  unavailabilityReason?: 'FULL' | 'STARTED' | 'CANCELLED' | 'EXPIRED' | 'NOT_FOUND' | null;
}

// ─── Card Games Common Types ──────────────────────────────────────────────────
export type CardSuit = 'HEARTS' | 'DIAMONDS' | 'CLUBS' | 'SPADES';

export interface PlayingCard {
  suit: CardSuit;
  rank: number; // 2..14 (14 = Ace)
  label: string; // "A", "K", "Q", "J", "10"... "2"
}

// ─── Teen Patti Specific Types ────────────────────────────────────────────────
export type TeenPattiHandType =
  | 'TRAIL'
  | 'PURE_SEQUENCE'
  | 'SEQUENCE'
  | 'COLOR'
  | 'PAIR'
  | 'HIGH_CARD';

export interface TeenPattiHandResult {
  type: TeenPattiHandType;
  score: number;
  description: string;
  sortedCards: PlayingCard[];
}

export type TeenPattiActionType = 'SEE_CARDS' | 'BLIND' | 'CHAAL' | 'PACK' | 'SHOW' | 'SIDE_SHOW';

export interface TeenPattiPlayerState {
  userId: string;
  username: string;
  seatIndex: number;
  cards?: PlayingCard[]; // Only present if sanitized for this specific user or at showdown
  isSeen: boolean;
  isPacked: boolean;
  totalBet: number;
  lastAction?: TeenPattiActionType;
}

export interface TeenPattiGameState {
  pot: number;
  bootAmount: number;
  currentChaalAmount: number;
  currentTurnUserId: string | null;
  turnExpiresAt: number | null;
  roundNumber: number;
  players: Record<string, TeenPattiPlayerState>;
  winners?: {
    userId: string;
    username: string;
    handResult: TeenPattiHandResult;
    prize: number;
  }[];
}

// ─── Sports Match Types ───────────────────────────────────────────────────────
export interface SportsTeam {
  id?: string;
  name: string;
  shortName?: string;
  logo?: string;
  score?: string;
  isWinner?: boolean;
}

export interface SportsMatch {
  id: string;
  sport: 'Cricket' | 'Football' | string;
  league: string;
  name: string;
  shortName?: string;
  startTime: string; // ISO date string
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CANCELLED';
  team1: SportsTeam;
  team2: SportsTeam;
  winnerTeamIndex?: number; // 1 = team1, 2 = team2, 0 = draw
  winnerName?: string;
  summary?: string;
}

export interface SportsRoomPrediction {
  userId: string;
  username: string;
  teamIndex: number;
  teamName: string;
  selectedAt: string;
}

export interface SportsRoomSettlement {
  status: 'SETTLED' | 'REFUNDED';
  totalPot: number;
  distributablePool?: number;
  commissionAmount?: number;
  winningTeamIndex?: number;
  winningTeamName?: string;
  winnersCount?: number;
  losersCount?: number;
  payoutPerWinner?: number;
  winnerUserIds?: string[];
  settledAt: string;
  reason?: string;
}

export interface SportsRoomConfig {
  matchId: string;
  sport: string;
  league: string;
  matchTitle: string;
  startTime: string;
  team1: SportsTeam;
  team2: SportsTeam;
  isUnlimited?: boolean;
  chosenTeam?: string;
  predictions?: Record<string, SportsRoomPrediction>;
  settlement?: SportsRoomSettlement;
}

// ─── Twenty Nine (29) Card Game Specific Types ────────────────────────────────
export type TwentyNinePhase =
  | 'WAITING'
  | 'BIDDING'
  | 'TRUMP_SELECTION'
  | 'PLAYING'
  | 'SETTLING'
  | 'CANCELLED'
  | 'COMPLETED';

export type TwentyNineActionType =
  | 'BID'
  | 'PASS'
  | 'SELECT_TRUMP'
  | 'REVEAL_TRUMP'
  | 'PLAY_CARD';

export interface TwentyNinePlayerState {
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  seatIndex: number; // 0, 1, 2, 3
  teamIndex: number; // 0 (seats 0 & 2) or 1 (seats 1 & 3)
  cardCount: number;
  cards?: PlayingCard[]; // Only present for this user's private state or at showdown/completion
  legalCards?: PlayingCard[]; // Cards currently legal to play for the active player
  hasPassedBid: boolean;
  isDisconnected?: boolean;
}

export interface TwentyNineTrickCard {
  userId: string;
  seatIndex: number;
  card: PlayingCard;
  isTrump: boolean;
}

export interface TwentyNineTrick {
  trickIndex: number;
  leadSuit?: CardSuit | null;
  cards: TwentyNineTrickCard[];
  winnerUserId?: string | null;
  winnerSeatIndex?: number | null;
  winnerTeamIndex?: number | null;
  points: number;
}

export interface TwentyNineGameState {
  roomId: string;
  sequence: number;
  phase: TwentyNinePhase;
  rulesVersion: string; // e.g. "single-deal-v1"
  dealerSeatIndex: number;
  currentTurnUserId: string | null;
  currentTurnSeatIndex: number | null;
  turnExpiresAt: number | null;

  // Bidding
  highestBid: number; // 0 if no bids, min 16, max 28
  highestBidderUserId: string | null;
  highestBidderSeatIndex: number | null;
  contractorUserId: string | null;
  contractorTeamIndex: number | null;
  contract: number;

  // Trump
  trumpSuit: CardSuit | null; // null for opponents while hidden
  isTrumpRevealed: boolean;
  trumpRevealedByUserId: string | null;
  trumpRevealedBySeatIndex: number | null;
  trumpRevealedAtTrickIndex: number | null;
  canRevealTrump?: boolean; // Convenience flag for the current actor

  // Tricks & Scoring
  currentTrickIndex: number; // 0..7
  currentTrick: TwentyNineTrick;
  previousTricks: TwentyNineTrick[];
  team0Points: number; // Card points won (0..28)
  team1Points: number;

  players: Record<string, TwentyNinePlayerState>;

  // Outcome
  winningTeamIndex?: number | null;
  winningUserIds?: string[];
  winnerPrizePerPlayer?: number;
  payouts?: Array<{ userId: string; amount: number }>;
  explanation?: string;
}
