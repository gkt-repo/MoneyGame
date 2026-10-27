import './test-env';
import assert from 'node:assert/strict';
import { Server } from 'socket.io';
import { prisma } from '../src/db';
import { gameManager } from '../src/modules/game/game.manager';
import { gameRegistry } from '../src/modules/game/game.registry';
import { waitForCardStart } from './wait-for-card-start';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const events: { channel: string; name: string; data: any }[] = [];
  const channel = (name: string) => ({
    emit: (event: string, data: any) => events.push({ channel: name, name: event, data }),
    except: () => channel(name),
  });
  gameManager.setSocketServer({ to: channel, emit: () => {}, sockets: { adapter: { rooms: new Map() } } } as unknown as Server);
  try {
    for (const [gameType, capacity] of [['TEEN_PATTI', 6], ['TWENTY_NINE', 4]] as const) {
      const users = await Promise.all(Array.from({ length: capacity }, (_, i) => prisma.user.create({
        data: { username: `${gameType}_${i}`, wallet: { create: { balance: 100 } } },
      })));
      const room = (await gameManager.createRoom(users[0].id, 10, capacity, null, gameType))!;
      for (let i = 1; i < capacity - 1; i++) await gameManager.joinRoom(users[i].id, room.roomCode, null, i);
      const waiting = (await gameManager.getRoomDetails(room.id))!;
      assert.equal(waiting.status, 'WAITING');
      assert.equal(waiting.countdown, null);
      assert.equal(waiting.gameState, null);
      assert.equal(waiting.players.length, capacity - 1);
      const lastUser = users[capacity - 1];
      const joinedAt = Date.now();
      const full = (await gameManager.joinRoom(lastUser.id, room.roomCode, null, capacity - 1))!;
      assert.equal(full.status, 'COUNTDOWN');
      assert.equal(full.countdown, 5);
      assert.equal(full.gameState, null);
      assert(full.customConfig!.countdownEndsAt >= joinedAt + 5000);
      // Repeated engine start requests must not bypass the waiting period.
      await gameRegistry.get(gameType).startGame(room.id, null);
      assert.equal(gameRegistry.get(gameType).getClientState(room.id), null);
      await pause(2100);
      const reconnected = (await gameManager.getRoomDetails(room.id, lastUser.id))!;
      assert.equal(reconnected.status, 'COUNTDOWN');
      assert(reconnected.countdown! > 0 && reconnected.countdown! < 5);
      assert.equal(reconnected.gameState, null);
      const active = await waitForCardStart(room.id);
      assert(Date.now() - joinedAt >= 5000, 'Must wait five seconds before dealing');
      assert.equal(active.countdown, null);
      assert.equal(Object.keys(active.gameState.players).length, capacity);
      assert.deepEqual(events.filter(e => e.name === 'game_countdown' && e.data.roomId === room.id).map(e => e.data.countdown), [5, 4, 3, 2, 1, 0]);
      await gameManager.cancelRoomByAdmin(room.id, users[0].id, 'Test cleanup');

      // Admin cancellation during countdown refunds entries and prevents a late start.
      const cancelled = (await gameManager.createRoom(users[0].id, 10, capacity, null, gameType))!;
      for (let i = 1; i < capacity; i++) await gameManager.joinRoom(users[i].id, cancelled.roomCode, null, i);
      await gameManager.cancelRoomByAdmin(cancelled.id, users[0].id, 'Countdown cancelled');
      await pause(5100);
      assert.equal((await gameManager.getRoomDetails(cancelled.id))!.status, 'CANCELLED');
      assert.equal(gameRegistry.get(gameType).getClientState(cancelled.id), null);
      for (const user of users) {
        const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
        assert.equal(wallet.balance, 100);
        assert.equal(wallet.lockedBalance, 0);
      }
      console.log(`PASS ${gameType}: waits for all ${capacity} seats, synchronized countdown, reconnect, no early deal, cancellation and refunds`);
    }
  } finally {
    gameManager.stopTimers();
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
