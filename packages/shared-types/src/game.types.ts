export type RoomStatus = 'WAITING' | 'COUNTDOWN' | 'ROLLING' | 'COMPLETED' | 'CANCELLED';

export interface RoomPlayerDTO {
  id: string;
  roomId: string;
  userId: string;
  guessNumber: number;
  joinedAt: string | Date;
  user?: {
    username: string;
  };
}

export interface RoomDTO {
  id: string;
  roomCode: string;
  entryFee: number;
  maxPlayers: number;
  status: RoomStatus;
  winningNumber?: number | null;
  winnerId?: string | null;
  winner?: {
    username: string;
  } | null;
  players: RoomPlayerDTO[];
  createdAt: string | Date;
}

export interface CreateRoomDTO {
  userId: string;
  entryFee: number;
  maxPlayers: number;
  guessNumber: number;
}

export interface JoinRoomDTO {
  userId: string;
  roomCode: string;
  guessNumber: number;
}
