import { RoomDTO } from './game.types';

// Events emitted by Client to Server
export interface ClientToServerEvents {
  join_user_channel: (userId: string) => void;
  join_room_channel: (roomId: string) => void;
  leave_room_channel: (roomId: string) => void;
}

// Events emitted by Server to Client
export interface ServerToClientEvents {
  balance_updated: (data: { balance: number; lockedBalance: number }) => void;
  deposit_approved: (data: { depositId: string; amount: number; balance: number }) => void;
  room_player_joined: (room: RoomDTO) => void;
  game_started: (data: { roomId: string; countdownSeconds: number }) => void;
  game_completed: (data: { roomId: string; winningNumber: number; winnerId: string; winnerUsername: string; prizePool: number }) => void;
  admin_new_deposit: (data: { depositId: string; amount: number; username: string }) => void;
  admin_new_withdrawal: (data: { withdrawalId: string; amount: number; username: string }) => void;
}
