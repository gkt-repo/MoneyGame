import { Server } from 'socket.io';
import { GameDescriptor, GameType } from '@moneygame/shared-types';
import { IGameEngine, RoomWithPlayers, ActionResult } from '../../engine.interface';

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
    enabled: false, // Flagged for upcoming release
  };

  validateCreateOptions(options: { entryFee: number; maxPlayers: number }): void {
    if (options.maxPlayers !== 4) {
      throw new Error('29 Card Game strictly requires 4 players (2 vs 2)');
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

  async onPlayerJoined(_room: RoomWithPlayers, _userId: string, _io: Server | null): Promise<void> {
    // When 4th player joins, trigger 29 card bidding phase
  }

  async startGame(_roomId: string, _io: Server | null): Promise<void> {
    // Bidding & trick-taking loop
  }

  async handleAction(
    _roomId: string,
    _userId: string,
    _action: string,
    _payload: any,
    _io: Server | null
  ): Promise<ActionResult> {
    return { success: false, message: '29 Card Game will be available in the next update' };
  }

  getClientState(_roomId: string, _userId?: string): any {
    return null;
  }

  cleanupRoom(_roomId: string): void {}

  stopAllTimers(): void {}
}

export const twentyNineEngine = new TwentyNineEngine();
