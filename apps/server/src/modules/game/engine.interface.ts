import { Server } from 'socket.io';
import { GameType, GameDescriptor } from '@moneygame/shared-types';

export interface RoomWithPlayers {
  id: string;
  roomCode: string;
  gameType: string;
  entryFee: number;
  maxPlayers: number;
  status: string;
  winningNumber: number | null;
  winnerId: string | null;
  winnerPrize: number | null;
  customConfig: string | null;
  createdAt: Date;
  players: Array<{
    id: string;
    roomId: string;
    userId: string;
    seatIndex: number;
    status: string;
    guessNumber: number | null;
    joinedAt: Date;
    user?: {
      id: string;
      username: string;
    };
  }>;
  winner?: {
    id: string;
    username: string;
  } | null;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  gameState?: any;
  wallet?: any;
}

export interface IGameEngine {
  readonly gameType: GameType;
  readonly descriptor: GameDescriptor;

  /**
   * Validate parameters when a room is created
   */
  validateCreateOptions(options: {
    entryFee: number;
    maxPlayers: number;
    guessNumber?: number;
    customConfig?: Record<string, any>;
  }): void;

  /**
   * Validate parameters when a player joins the room
   */
  validateJoin(
    room: RoomWithPlayers,
    userId: string,
    joinData?: { guessNumber?: number; seatIndex?: number }
  ): void;

  /**
   * Lifecycle hook: Called immediately after a player is added to the database
   */
  onPlayerJoined(room: RoomWithPlayers, userId: string, io: Server | null): Promise<void>;

  /**
   * Lifecycle hook: Called when table reaches required players or game is triggered
   */
  startGame(roomId: string, io: Server | null): Promise<void>;

  /**
   * Handle an in-game action (e.g. CHAAL, PACK, SHOW, SEEN)
   */
  handleAction(
    roomId: string,
    userId: string,
    action: string,
    payload: any,
    io: Server | null
  ): Promise<ActionResult>;

  /**
   * Return client-safe game state (e.g., masking opponents' cards for anti-cheat)
   */
  getClientState(roomId: string, userId?: string): any;

  /**
   * Clean up in-memory timers / state when room finishes or is cancelled
   */
  cleanupRoom(roomId: string): void;
}
