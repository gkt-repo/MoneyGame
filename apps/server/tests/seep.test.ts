import './test-env';
import assert from 'node:assert/strict';
import { prisma } from '../src/db';
import { gameManager } from '../src/modules/game/game.manager';
import { seepEngine } from '../src/modules/game/engines/seep/seep.engine';
import { SeepInternal, applyBid, applyMove, bidOptions, clientState, createGame, deck, legalMoves, loose, points, value } from '../src/modules/game/engines/seep/seep.rules';
import { SeepCard, SeepFloorItem } from '@moneygame/shared-types';
import { waitForCardStart } from './wait-for-card-start';

const card = (rank: number, suit: SeepCard['suit'] = 'CLUBS'): SeepCard => ({ id: `${suit}-${rank}`, rank, suit, label: rank === 14 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : `${rank}` });
const fixture = (hand: SeepCard[], floor: SeepFloorItem[], count = 2): SeepInternal => {
  const game = createGame('fixture', 25, Array.from({ length: count }, (_, seatIndex) => ({ userId: `${seatIndex}`, seatIndex })));
  game.phase = 'PLAYING'; game.bid = 9; game.turnsPlayed = 2;
  game.players['0'].cards = hand; game.floor = floor;
  return game;
};

async function main() {
  assert.equal(new Set(deck().map(c => c.id)).size, 52);
  assert.equal(deck().reduce((n, c) => n + points(c), 0), 100);
  assert.equal(value(card(14)), 1);
  assert.equal(points(card(10, 'DIAMONDS')), 6);
  assert.throws(() => seepEngine.validateCreateOptions({ entryFee: 25, maxPlayers: 3 }), /2 players or 4/);
  assert.throws(() => seepEngine.validateCreateOptions({ entryFee: 0, maxPlayers: 2 }), /greater than zero/);

  let game = fixture([card(8)], [loose(card(14)), loose(card(3)), loose(card(5)), loose(card(7)), loose(card(8, 'HEARTS'))]);
  const capture = legalMoves(game, '0').find(m => m.type === 'CAPTURE')!;
  assert.equal(capture.floorIds.length, 5, 'Capture all disjoint matching groups');
  assert(!legalMoves(game, '0').some(m => m.type === 'THROW'));
  applyMove(game, capture); assert.equal(game.lastMove?.sweep, 50);
  game = fixture([card(11)], [loose(card(2)), loose(card(3)), loose(card(5)), loose(card(6))]);
  assert.equal(legalMoves(game, '0').filter(m => m.type === 'CAPTURE').length, 2, 'Overlapping groups allow either legal capture');

  const house: SeepFloorItem = { id: 'house', value: 9, cards: [card(4), card(5)], isHouse: true, cemented: false, owners: ['1'] };
  game = fixture([card(3), card(12)], [house, loose(card(2))]);
  assert(legalMoves(game, '0').some(m => m.type === 'BUILD' && m.houseValue === 12));
  assert(!legalMoves(game, '0').some(m => m.type === 'CAPTURE' && m.cardId === card(12).id), 'Houses cannot be captured as part of sums');
  house.cemented = true;
  assert(!legalMoves(game, '0').some(m => m.type === 'BUILD' && m.houseValue === 12));
  house.cemented = false; house.owners = ['0'];
  assert(!legalMoves(game, '0').some(m => m.type === 'BUILD' && m.houseValue === 12), 'Cannot raise own house');
  game = fixture([card(9), card(2)], [house, loose(card(7))]);
  assert(!legalMoves(game, '0').some(m => m.cardId === card(9).id && m.type !== 'CAPTURE'), 'Reserve the last matching house card');
  house.owners = ['2'];
  game = fixture([card(9)], [house], 4);
  assert(legalMoves(game, '0').some(m => m.type === 'BUILD'), 'Partner may cement without holding another matching card');
  house.owners = ['1'];
  assert(!legalMoves(game, '0').some(m => m.type === 'BUILD'), 'Opponent must retain a matching card');

  for (const turn of [0, 3, 47]) {
    game = fixture([card(9)], [loose(card(9, 'SPADES'))]); game.turnsPlayed = turn; game.bid = 9;
    applyMove(game, legalMoves(game, '0').find(m => m.type === 'CAPTURE')!);
    assert.equal(game.lastMove?.sweep, turn === 0 ? 25 : turn === 47 ? 0 : 50);
  }
  // Full simulated games exercise both deals, partnerships, reservations, and card conservation.
  for (let run = 0; run < 120; run++) {
    const count = run % 2 ? 2 : 4;
    game = createGame('simulation', 25, Array.from({ length: count }, (_, seatIndex) => ({ userId: `${seatIndex}`, seatIndex })));
    assert.equal(game.floor.length, 0, 'Floor hidden before bid');
    applyBid(game, bidOptions(game)[0]);
    for (let turn = 0; turn < 48; turn++) {
      const moves = legalMoves(game, game.currentTurnUserId!);
      assert(moves.length, `No legal move in run ${run}, turn ${turn}`);
      applyMove(game, moves[(run * 7 + turn * 13) % moves.length]); game.sequence++;
      const cards = [...game.stock, ...Object.values(game.players).flatMap(p => p.cards), ...game.floor.flatMap(i => i.cards), ...game.captured.flat()];
      assert.equal(cards.length, 52); assert.equal(new Set(cards.map(c => c.id)).size, 52);
      for (const item of game.floor.filter(i => i.isHouse)) for (const owner of item.owners) assert(game.players[owner].cards.some(c => value(c) === item.value), 'House owner must retain matching card');
      const safe = clientState(game, '0');
      assert.equal(safe.players['1'].cards, undefined);
      assert.equal((safe as any).stock, undefined);
      if (turn === 23 && count === 2) { assert.equal(game.dealNumber, 2); assert.equal(game.stock.length, 0); assert.equal(game.players['0'].cards.length, 12); }
    }
    assert.equal(game.phase, 'SETTLING');
    assert.equal(game.teams[0].cardPoints + game.teams[1].cardPoints, 100);
  }
  console.log('Seep rules: 120 complete games, legal captures, house restrictions, privacy and scoring passed');

  for (const count of [2, 4]) {
    const users = await Promise.all(Array.from({ length: count }, (_, i) => prisma.user.create({ data: { username: `seep-${count}-${i}`, wallet: { create: { balance: 500 } } } })));
    const entryFee = 25.02;
    const room = (await gameManager.createRoom(users[0].id, entryFee, count, null, 'SEEP', undefined, count === 4))!;
    const preview = await gameManager.getRoomPreviewByInvitation(room.invitationToken!);
    assert.equal(preview!.rulesVersion, 'seep-single-deal-v1');
    assert.equal(room.status, 'WAITING');
    for (let i = 1; i < count; i++) {
      if (i === 1) await gameManager.joinRoomByInvitation(users[i].id, room.invitationToken!, null, i);
      else await gameManager.joinRoom(users[i].id, room.roomCode, null, i);
    }
    const countdown = await gameManager.getRoomDetails(room.id, users[0].id);
    assert.equal(countdown!.status, 'COUNTDOWN'); assert.equal(countdown!.gameState, null);
    await seepEngine.startGame(room.id, null);
    assert.equal(seepEngine.getClientState(room.id), null, 'Cannot bypass countdown');
    await waitForCardStart(room.id, users[0].id);
    const initial = seepEngine.getClientState(room.id, users[0].id)!;
    assert.equal(initial.players[users[0].id].cards?.length, 4);
    assert.equal(initial.floor.length, 0);
    const request = { bid: initial.bidOptions![0], expectedSequence: initial.sequence, actionId: 'test-opening-bid' };
    const duplicate = await Promise.all([gameManager.handlePlayerAction(room.id, users[0].id, 'BID', request), gameManager.handlePlayerAction(room.id, users[0].id, 'BID', request)]);
    assert(duplicate.every(r => r.success));
    assert.equal(seepEngine.getClientState(room.id)!.sequence, 1, 'Duplicate actions applied once');
    assert.equal((await gameManager.handlePlayerAction(room.id, users[0].id, 'PLAY_MOVE', { expectedSequence: 0, actionId: 'stale-action' })).success, false);
    assert.equal((await seepEngine.handleAction(room.id, 'outsider', 'PLAY_MOVE', {}, null)).success, false);
    assert.equal((await gameManager.handlePlayerAction(room.id, users[0].id, 'PLAY_MOVE', { expectedSequence: 1, actionId: 'forged-action', moveId: 'forged' })).success, false);
    for (let turn = 0; turn < 48; turn++) {
      const state = seepEngine.getClientState(room.id)!;
      const uid = state.currentTurnUserId!;
      const privateState = seepEngine.getClientState(room.id, uid)!;
      const move = privateState.legalMoves![(turn * 7) % privateState.legalMoves!.length];
      assert(move);
      const result = await gameManager.handlePlayerAction(room.id, uid, 'PLAY_MOVE', { expectedSequence: state.sequence, actionId: `test-play-${turn}`, moveId: move.id });
      assert.equal(result.success, true, result.message || 'Action must succeed');
      if (turn === 10) {
        const before = seepEngine.getClientState(room.id, uid);
        seepEngine.cleanupRoom(room.id);
        assert(await seepEngine.restoreRoom(room.id, null));
        const after = seepEngine.getClientState(room.id, uid)!;
        assert.equal(after.sequence, before!.sequence);
        assert.deepEqual(after.players, before!.players);
      }
    }
    const completed = (await gameManager.getRoomDetails(room.id, users[0].id))!;
    const state = seepEngine.getClientState(room.id)!;
    assert.equal(completed.status, 'COMPLETED'); assert.equal(state.phase, 'COMPLETED');
    assert.equal(state.teams[0].cardPoints + state.teams[1].cardPoints, 100);
    const wallets = await prisma.wallet.findMany({ where: { userId: { in: users.map(u => u.id) } } });
    assert(wallets.every(w => w.lockedBalance === 0));
    for (const wallet of wallets) {
      const payout = state.payouts!.find(p => p.userId === wallet.userId)?.amount || 0;
      assert.equal(Math.round(wallet.balance * 100), 50000 - 2502 + Math.round(payout * 100));
    }
    const before = wallets.map(w => w.balance).sort();
    await (seepEngine as any).settle((seepEngine as any).games.get(room.id), null);
    assert.deepEqual((await prisma.wallet.findMany({ where: { userId: { in: users.map(u => u.id) } } })).map(w => w.balance).sort(), before, 'No double payment');
    assert(completed.customConfig?.payouts);
    seepEngine.cleanupRoom(room.id);
    assert(await seepEngine.restoreRoom(room.id, null));
    assert.equal(seepEngine.getClientState(room.id)!.phase, 'COMPLETED');
    console.log(`Seep ${count} players: create/join/countdown, durable actions, reconnect, settlement and wallet conservation passed`);
  }

  // Draws return original entries with no commission.
  const drawUsers = await Promise.all([0, 1].map(i => prisma.user.create({ data: { username: `draw-${i}`, wallet: { create: { balance: 100 } } } })));
  const drawRoom = (await gameManager.createRoom(drawUsers[0].id, 25, 2, null, 'SEEP'))!;
  await gameManager.joinRoom(drawUsers[1].id, drawRoom.roomCode);
  await waitForCardStart(drawRoom.id);
  for (const expected of [1, 2]) {
    const current = (seepEngine as any).games.get(drawRoom.id) as SeepInternal;
    (seepEngine as any).schedule(current, null, 1);
    const deadline = Date.now() + 2000;
    while (seepEngine.getClientState(drawRoom.id)!.sequence < expected && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(seepEngine.getClientState(drawRoom.id)!.sequence, expected, 'Timeout makes a legal move');
  }
  const draw = (seepEngine as any).games.get(drawRoom.id) as SeepInternal;
  draw.phase = 'SETTLING'; draw.currentTurnUserId = null; draw.turnExpiresAt = null;
  draw.teams.forEach(t => { t.points = 50; t.cardPoints = 50; });
  await (seepEngine as any).settle(draw, null);
  const drawResult = await gameManager.getRoomDetails(drawRoom.id, drawUsers[0].id);
  assert.equal(drawResult!.customConfig!.platformCommission, 0);
  for (const user of drawUsers) { const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } }); assert.equal(wallet.balance, 100); assert.equal(wallet.lockedBalance, 0); }
  console.log('Seep draw refunds passed');
  const cancelled = (await gameManager.createRoom(drawUsers[0].id, 25, 4, null, 'SEEP'))!;
  await gameManager.joinRoom(drawUsers[1].id, cancelled.roomCode);
  await gameManager.cancelWaitingRoom(cancelled.id, drawUsers[0].id);
  assert.equal((await gameManager.getRoomDetails(cancelled.id, drawUsers[0].id))!.status, 'CANCELLED');
  for (const user of drawUsers) { const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } }); assert.equal(wallet.balance, 100); assert.equal(wallet.lockedBalance, 0); }
  console.log('Seep timeout automation, invitations and waiting-room cancellation refunds passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { gameManager.stopTimers(); await prisma.$disconnect(); });
