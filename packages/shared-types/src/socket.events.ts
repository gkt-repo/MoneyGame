import { RoomDTO } from './game.types';

// Events emitted by Client to Server
export interface ClientToServerEvents {
  join_user_channel: (userId?: string) => void;
  join_room_channel: (roomId: string) => void;
  leave_room_channel: (roomId: string) => void;
  join_deposit_channel: (depositId: string) => void;
  leave_deposit_channel: (depositId: string) => void;
  join_admin_channel: () => void;
  game_action: (data: { roomId: string; action: string; payload?: any }) => void;
}

// Events emitted by Server to Client
export interface ServerToClientEvents {
  balance_updated: (data: { balance: number; lockedBalance: number }) => void;
  wallet_updated: (data: { balance: number; lockedBalance: number }) => void;
  deposit_approved: (data: { depositId?: string; amount?: number; totalAmount?: number; utr?: string | null; balance: number }) => void;
  room_updated: (room: RoomDTO) => void;
  lobby_rooms_updated: (rooms: RoomDTO[]) => void;
  game_countdown: (data: { countdown: number; roomId?: string }) => void;
  roll_started: (data?: { roomId?: string }) => void;
  roll_tick: (data: { number: number; roomId?: string }) => void;
  game_finished: (data: {
    winnerId: string;
    winnerUsername: string;
    prizePool: number;
    winnerPrize?: number;
    commissionAmount?: number;
    winningNumber?: number | null;
    reason?: string;
    room?: RoomDTO;
    showdown?: any[];
  }) => void;
  teen_patti_state: (state: any) => void;
  player_packed: (data: { userId: string; seatIndex: number }) => void;
  side_show_requested: (data: { requesterId: string; requesterUsername: string; targetId: string }) => void;
  side_show_resolved: (data: { requesterId: string; targetId: string; accepted: boolean }) => void;
  side_show_comparison: (data: { yourHand: any; opponentHand: any; winnerId: string }) => void;
  turn_timer_started: (data: { roomId?: string; currentTurnUserId: string | null; turnExpiresAt: number | null }) => void;
  game_action_response: (data: { success: boolean; action: string; message?: string }) => void;
  admin_new_deposit: (data: { depositId?: string; amount?: number; username?: string }) => void;
  admin_new_withdrawal: (data: { withdrawalId?: string; amount?: number; username?: string }) => void;
}
