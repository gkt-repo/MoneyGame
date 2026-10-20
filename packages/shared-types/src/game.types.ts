export type GameType = 'GUESS_NUMBER' | 'TEEN_PATTI' | 'TWENTY_NINE';

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
  guessNumber?: number;
  customConfig?: Record<string, any>;
}

export interface JoinRoomDTO {
  userId: string;
  roomCode: string;
  guessNumber?: number;
  seatIndex?: number;
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

