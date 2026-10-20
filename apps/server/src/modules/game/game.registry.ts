import { GameType, GameDescriptor } from '@moneygame/shared-types';
import { IGameEngine } from './engine.interface';
import { guessNumberEngine } from './engines/guess-number/guess-number.engine';
import { teenPattiEngine } from './engines/teen-patti/teen-patti.engine';
import { twentyNineEngine } from './engines/twenty-nine/twenty-nine.engine';

export class GameRegistry {
  private engines = new Map<GameType, IGameEngine>();

  register(engine: IGameEngine): void {
    this.engines.set(engine.gameType, engine);
  }

  get(gameType: string): IGameEngine {
    const engine = this.engines.get(gameType as GameType);
    if (!engine) {
      throw new Error(`Unsupported game type: ${gameType}`);
    }
    return engine;
  }

  has(gameType: string): boolean {
    return this.engines.has(gameType as GameType);
  }

  listGames(): GameDescriptor[] {
    return Array.from(this.engines.values()).map(e => e.descriptor);
  }
}

export const gameRegistry = new GameRegistry();

// Auto-register built-in game engines
gameRegistry.register(guessNumberEngine);
gameRegistry.register(teenPattiEngine);
gameRegistry.register(twentyNineEngine);

