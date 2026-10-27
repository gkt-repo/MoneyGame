import './test-env';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { Server } from 'socket.io';
import { io as connect, Socket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/db';
import { config } from '../src/config';
import { router } from '../src/routes/api.routes';
import { configureSockets } from '../src/socket';
import { gameManager } from '../src/modules/game/game.manager';
import { twentyNineEngine as engine } from '../src/modules/game/engines/twenty-nine/twenty-nine.engine';
import { sportsService } from '../src/modules/game/engines/sports-match/sports.service';
import { profileService } from '../src/modules/profile/profile.service';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const app = express(); app.use(express.json()); app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const io = new Server(server); configureSockets(io); gameManager.setSocketServer(io);
  const sockets: Socket[] = [];
  const users = await Promise.all(Array.from({length: 5}, (_, i) => prisma.user.create({data: {
    username: `product_${i}`, wallet: {create: {balance: 1000}},
  }})));
  const token = (id: string) => jwt.sign({userId: id, role: 'USER', tokenVersion: 0}, config.jwtSecret, {audience: config.userAudience, expiresIn: '1h'});
  const get = async (path: string, userId?: string) => {
    const response = await fetch(origin + '/api' + path, {headers: userId ? {Authorization: `Bearer ${token(userId)}`} : {}});
    return {status: response.status, body: await response.json() as any};
  };
  const send = async (roomId: string, actor: string, action: string, data: any = {}) => {
    const state = engine.getClientState(roomId)!;
    return engine.handleAction(roomId, actor, action, {...data, expectedSequence: state.sequence, actionId: crypto.randomUUID()}, io);
  };
  const create29 = async (fee = 1.02) => {
    const room = (await gameManager.createRoom(users[0].id, fee, 4, null, 'TWENTY_NINE'))!;
    for (let i = 1; i < 4; i++) await gameManager.joinRoom(users[i].id, room.roomCode, null, i);
    return room;
  };
  const snapshot = async (id: string) => JSON.parse((await prisma.room.findUniqueOrThrow({where:{id}})).engineState!);
  try {
    const received: any[][] = users.map(() => []);
    for (let i = 0; i < users.length; i++) {
      const socket = connect(origin, {auth: {token: token(users[i].id)}, transports: ['websocket'], forceNew: true});
      socket.on('twenty_nine_state', data => received[i].push(data));
      await new Promise<void>((resolve, reject) => {socket.once('connect', resolve); socket.once('connect_error', reject);});
      sockets.push(socket);
    }
    const privateRoom = (await gameManager.createRoom(users[0].id, 10, 4, 1, 'GUESS_NUMBER', {}, true))!;
    assert.equal((await get(`/rooms?userId=${users[0].id}`)).body.rooms.some((r: any) => r.id === privateRoom.id), false);
    assert.equal((await get(`/rooms/${privateRoom.id}`, users[4].id)).status, 404);
    assert((await get('/rooms', users[0].id)).body.rooms.some((r: any) => r.id === privateRoom.id));
    const denied = new Promise<any>(resolve => sockets[4].once('subscription_error', resolve));
    sockets[4].emit('join_room_channel', privateRoom.id);
    assert.match((await denied).message, /private/);
    const oldToken = privateRoom.invitationToken!;
    const oldCode = privateRoom.roomCode;
    await gameManager.updateInvitation(privateRoom.id, users[0].id, 'REVOKE');
    await assert.rejects(gameManager.joinRoomByInvitation(users[1].id, oldToken, 2));
    await assert.rejects(gameManager.joinRoom(users[1].id, oldCode, 2));
    const renewed = (await gameManager.updateInvitation(privateRoom.id, users[0].id, 'RENEW'))!;
    await gameManager.joinRoomByInvitation(users[1].id, renewed.invitationToken!, 2);
    await prisma.room.update({where:{id:privateRoom.id},data:{invitationExpiresAt:new Date(0)}});
    assert.equal((await gameManager.getRoomPreviewByInvitation(renewed.invitationToken!))?.unavailabilityReason, 'EXPIRED');
    await assert.rejects(gameManager.joinRoom(users[2].id, renewed.roomCode, 3), /expired|revoked/);
    console.log('PASS: unauthenticated identity spoofing, private HTTP/socket access, revocation, renewal, expiry, and code policy.');

    const room = await create29();
    for (const socket of sockets) socket.emit('join_room_channel', room.id);
    await pause(30);
    for (const i of [1,2,3,0]) assert((await send(room.id, users[i].id, 'PASS')).success);
    const redealt = await snapshot(room.id);
    assert.equal(redealt.dealerSeatIndex, 1);
    assert.equal(redealt.currentTurnUserId, users[2].id);
    const cards = [...redealt.deck, ...Object.values(redealt.players).flatMap((p: any) => p.cards)];
    assert.equal(new Set(cards.map(c => `${c.suit}:${c.rank}`)).size, 32);
    engine.cleanupRoom(room.id);
    assert(await engine.restoreRoom(room.id, io));
    assert.equal(engine.getClientState(room.id)!.currentTurnUserId, users[2].id);
    await (engine as any).handleTurnTimeout(room.id, io);
    assert.equal((await snapshot(room.id)).players[users[2].id].hasPassedBid, true);
    const stateBefore = engine.getClientState(room.id)!;
    const persistence = engine.persistState.bind(engine);
    engine.persistState = async () => {throw new Error('Injected snapshot failure');};
    await assert.rejects(send(room.id, stateBefore.currentTurnUserId!, 'BID', {amount:16}), /snapshot failure/);
    engine.persistState = persistence;
    assert.equal(engine.getClientState(room.id)!.sequence, stateBefore.sequence);
    assert.equal(engine.getClientState(room.id)!.highestBid, 0);
    const actor = stateBefore.currentTurnUserId!;
    const action = {amount:16, expectedSequence:stateBefore.sequence, actionId:crypto.randomUUID()};
    const repeated = await Promise.all([engine.handleAction(room.id, actor, 'BID', action, io), engine.handleAction(room.id, actor, 'BID', action, io)]);
    assert(repeated.every(r => r.success));
    assert.equal(engine.getClientState(room.id)!.sequence, stateBefore.sequence + 1);
    assert.equal((await engine.handleAction(room.id, actor, 'PASS', {expectedSequence:stateBefore.sequence}, io)).success, false);
    while (engine.getClientState(room.id)!.phase === 'BIDDING') {
      const state = engine.getClientState(room.id)!;
      await send(room.id, state.currentTurnUserId!, 'PASS');
    }
    const contractor = engine.getClientState(room.id)!.contractorUserId!;
    await send(room.id, contractor, 'SELECT_TRUMP', {suit:'HEARTS'});
    const anonymous = await get('/rooms');
    const entry = anonymous.body.rooms.find((r: any) => r.id === room.id);
    assert.equal(entry.engineState, undefined); assert.equal(entry.customConfig?.twentyNineState, undefined);
    const details = (await get(`/rooms/${room.id}`)).body.room;
    assert.equal(details.engineState, undefined); assert.equal(details.customConfig?.twentyNineState, undefined);
    assert.equal(details.gameState.trumpSuit, null);
    // Legacy snapshots must also be filtered from every presentation.
    await prisma.room.update({where:{id:room.id},data:{customConfig:JSON.stringify({twentyNineState:await snapshot(room.id)})}});
    assert.equal((await get(`/rooms/by-code/${room.roomCode}`)).body.room.customConfig.twentyNineState, undefined);
    assert.equal((await get('/rooms')).body.rooms.find((r: any) => r.id === room.id).customConfig.twentyNineState, undefined);
    await pause(30);
    for (let i = 0; i < users.length; i++) {
      for (const state of received[i].filter(s => s.roomId === room.id)) {
        for (const [uid, player] of Object.entries(state.players) as any) if (uid !== users[i].id) assert.equal(player.cards, undefined);
        if (users[i].id !== state.contractorUserId && !state.isTrumpRevealed) assert.equal(state.trumpSuit, null);
      }
    }
    assert.equal(received[0].at(-1).players[users[0].id].cards.length, 8);
    assert.equal(received[4].at(-1).players[users[0].id].cards, undefined);
    console.log('PASS: all-pass redeal uniqueness, restart, durable timeout, failed-save rollback, concurrent retries, and HTTP/socket hidden-state isolation.');

    await engine.setConnected(contractor, false, io);
    const disconnected = engine.getClientState(room.id)!;
    assert(disconnected.turnExpiresAt! >= Date.now() + 28000);
    await engine.setConnected(contractor, true, io);
    // Play a complete legal deal, then inject a real settlement failure twice.
    while (engine.getClientState(room.id)!.previousTricks.length < 7 || engine.getClientState(room.id)!.currentTrick.cards.length < 3) {
      const state = engine.getClientState(room.id)!;
      const view = engine.getClientState(room.id, state.currentTurnUserId!)!;
      assert((await send(room.id, state.currentTurnUserId!, 'PLAY_CARD', {card:view.players[state.currentTurnUserId!].legalCards![0]})).success);
    }
    const transactions = require('../src/transaction');
    const original = transactions.serializable;
    let failures = 0;
    transactions.serializable = async () => { failures++; throw new Error('Injected settlement outage'); };
    try {
      const state = engine.getClientState(room.id)!;
      const view = engine.getClientState(room.id, state.currentTurnUserId!)!;
      await send(room.id, state.currentTurnUserId!, 'PLAY_CARD', {card:view.players[state.currentTurnUserId!].legalCards![0]});
      assert.equal((await snapshot(room.id)).phase, 'SETTLING');
      assert.equal(engine.getClientState(room.id)!.phase, 'SETTLING');
      await pause(3200);
      assert(failures >= 2);
      engine.cleanupRoom(room.id);
      assert(await engine.restoreRoom(room.id, io));
      assert.equal(engine.getClientState(room.id)!.phase, 'SETTLING');
    } finally { transactions.serializable = original; }
    await engine.finishGame(engine.gameStates.get(room.id)!, io);
    const complete = await prisma.room.findUniqueOrThrow({where:{id:room.id}});
    assert.equal(complete.status, 'COMPLETED');
    const result = JSON.parse(complete.customConfig!);
    assert.deepEqual(result.payouts.map((p: any) => p.amount), [1.84,1.83]);
    const beforeDuplicate = await prisma.wallet.findMany({where:{userId:{in:users.slice(0,4).map(u=>u.id)}},orderBy:{userId:'asc'}});
    await engine.finishGame(engine.gameStates.get(room.id)!, io);
    assert.deepEqual(await prisma.wallet.findMany({where:{userId:{in:users.slice(0,4).map(u=>u.id)}},orderBy:{userId:'asc'}}), beforeDuplicate);
    assert.equal(await prisma.transaction.count({where:{referenceId:room.id,type:'ROOM_WIN'}}),2);
    for (const id of result.winnerUserIds) assert((await profileService.getUserProfile(id)).recentGames.some(r=>r.roomId===room.id && r.isWin));
    console.log('PASS: disconnect grace, full deal, persistent settlement failure/retry/restart, odd-paise team split, duplicate payment protection, and team profiles.');

    const cancelled = await create29();
    await gameManager.cancelRoomByAdmin(cancelled.id, users[4].id, 'Regression refund');
    assert.equal((await prisma.room.findUniqueOrThrow({where:{id:cancelled.id}})).status,'CANCELLED');
    assert.equal(await engine.restoreRoom(cancelled.id, io), false);
    assert.equal(await prisma.transaction.count({where:{referenceId:cancelled.id,type:'REFUND'}}),4);
    const abandoned = await create29();
    engine.cleanupRoom(abandoned.id);
    // A restarted server has no connected sockets, regardless of saved flags.
    assert(await engine.restoreRoom(abandoned.id, new Server()));
    assert(Object.values(engine.getClientState(abandoned.id)!.players).every(p => p.isDisconnected));
    const abandonedState = engine.gameStates.get(abandoned.id)!;
    for (const u of users.slice(0,4)) abandonedState.disconnectedSince![u.id] = Date.now() - 300001;
    await (engine as any).handleTurnTimeout(abandoned.id, io);
    await (engine as any).handleTurnTimeout(abandoned.id, io);
    assert.equal((await prisma.room.findUniqueOrThrow({where:{id:abandoned.id}})).status,'CANCELLED');
    assert.equal(await prisma.transaction.count({where:{referenceId:abandoned.id,type:'REFUND'}}),4);
    assert.equal(engine.getClientState(abandoned.id), null);

    const recovering = (await gameManager.createRoom(users[0].id, 1, 4, null, 'TWENTY_NINE'))!;
    for (const i of [1,2]) await gameManager.joinRoom(users[i].id, recovering.roomCode, null, i);
    const updateMany = prisma.room.updateMany.bind(prisma.room);
    let failedInitialization = false;
    (prisma.room as any).updateMany = async (args: any) => {
      if (args.data.engineState && args.where.engineState === null && !failedInitialization) {
        failedInitialization = true; throw new Error('Injected first-deal save failure');
      }
      return updateMany(args);
    };
    try {
      await gameManager.joinRoom(users[3].id, recovering.roomCode, null, 3);
      assert(failedInitialization);
      assert.equal(engine.getClientState(recovering.id), null);
      await pause(3200);
      assert.equal((await snapshot(recovering.id)).phase, 'BIDDING');
      assert.equal(engine.getClientState(recovering.id)?.phase, 'BIDDING');
    } finally { prisma.room.updateMany = updateMany; }
    await gameManager.cancelRoomByAdmin(recovering.id, users[4].id, 'Recovery test complete');
    console.log('PASS: abandoned-table refunds are idempotent and a failed initial snapshot retries safely.');
    // Sports result contract uses two winners, and profiles must credit both individually.
    const sports = await prisma.room.create({data:{roomCode:'PROFILE-SPORTS',gameType:'SPORTS_MATCH',entryFee:10,maxPlayers:4,players:{create:users.slice(0,3).map((u,i)=>({userId:u.id,seatIndex:i,guessNumber:i<2?1:2}))}}});
    for (const u of users.slice(0,3)) await prisma.wallet.update({where:{userId:u.id},data:{balance:{decrement:10},lockedBalance:{increment:10}}});
    await sportsService.settleSportsPool(sports.id,1,'Winning team');
    for (const u of users.slice(0,2)) {
      const row = (await profileService.getUserProfile(u.id)).recentGames.find(r=>r.roomId===sports.id)!;
      assert(row.isWin); assert.equal(row.prize,13.5);
    }
    console.log('PASS: cancellation refunds and sports multi-winner history.');
  } finally {
    gameManager.stopTimers(); for (const socket of sockets) socket.disconnect();
    await pause(30); gameManager.stopTimers();
    await new Promise<void>(resolve => io.close(() => resolve()));
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
