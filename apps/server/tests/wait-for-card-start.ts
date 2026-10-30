import assert from 'node:assert/strict';
import { gameManager } from '../src/modules/game/game.manager';

export async function waitForCardStart(roomId: string, userId?: string) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const room = await gameManager.getRoomDetails(roomId, userId);
    if (room?.status === 'PLAYING' && room.gameState) return room;
    assert.equal(room?.status, 'COUNTDOWN');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Card match did not start after countdown');
}
