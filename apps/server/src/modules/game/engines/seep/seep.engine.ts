import { Server } from 'socket.io';
import { GameDescriptor, GameType } from '@moneygame/shared-types';
import { IGameEngine, RoomWithPlayers, ActionResult } from '../../engine.interface';
import { prisma } from '../../../../db';
import { serializable } from '../../../../transaction';
import { moveWallet } from '../../../../wallet-ledger';
import { toPaise } from '../../../../money';
import { getEffectiveCommissionPercent, walletService } from '../../../wallet/wallet.service';
import { publicRoomConfig, roomCountdown } from '../../room-presentation';
import { SeepInternal, applyBid, applyMove, bidOptions, clientState, createGame, legalMoves } from './seep.rules';

const TURN_MS = 30000;

export class SeepEngine implements IGameEngine {
  readonly gameType: GameType = 'SEEP';
  readonly descriptor: GameDescriptor = {
    id: 'SEEP', name: 'Seep', tagline: 'Build houses. Capture spades. Sweep the table.',
    description: 'Classic 52-card Seep. Play head-to-head or in opposite-seat partnerships. Single deal, 100 card points plus sweep bonuses.',
    minPlayers: 2, maxPlayers: 4, defaultEntryFees: [25, 50, 100, 250, 500], icon: '♠', enabled: true,
  };
  private games = new Map<string, SeepInternal>();
  private timers = new Map<string, NodeJS.Timeout>();
  private queues = new Map<string, Promise<unknown>>();

  private enqueue<T>(id: string, work: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(id) || Promise.resolve()).catch(() => {}).then(work);
    this.queues.set(id, next);
    void next.finally(() => { if (this.queues.get(id) === next) this.queues.delete(id); }).catch(() => {});
    return next;
  }
  validateCreateOptions(options: { entryFee: number; maxPlayers: number }): void {
    if (![2, 4].includes(options.maxPlayers)) throw new Error('Seep requires 2 players or 4 players (2 vs 2)');
    if (!Number.isFinite(options.entryFee) || options.entryFee <= 0) throw new Error('Entry fee must be greater than zero');
  }
  validateJoin(room: RoomWithPlayers, uid: string): void {
    if (room.status !== 'WAITING') throw new Error('This table has already started');
    if (room.players.length >= room.maxPlayers) throw new Error('Seep table is full');
    if (room.players.some(p => p.userId === uid)) throw new Error('You are already seated');
  }
  async onPlayerJoined(room: RoomWithPlayers, _uid: string, io: Server | null) {
    if (room.players.length === room.maxPlayers) await this.startGame(room.id, io);
  }
  async startGame(roomId: string, io: Server | null): Promise<void> {
    await this.enqueue(roomId, async () => {
      const room = await prisma.room.findUnique({ where: { id: roomId }, include: { players: { include: { user: { select: { username: true } } } } } });
      if (!room || room.gameType !== 'SEEP' || !['WAITING', 'COUNTDOWN'].includes(room.status) || room.players.length !== room.maxPlayers) return;
      if ((roomCountdown(room) ?? 0) > 0) return;
      this.validateCreateOptions(room);
      const game = createGame(roomId, room.entryFee, room.players);
      game.turnExpiresAt = Date.now() + TURN_MS;
      const saved = await prisma.room.updateMany({ where: { id: roomId, status: room.status }, data: {
        status: 'PLAYING', engineState: JSON.stringify(game), engineSequence: 0,
        customConfig: JSON.stringify({ ...publicRoomConfig(room.customConfig), rulesVersion: game.rulesVersion }),
      } });
      if (!saved.count) return;
      this.games.set(roomId, game);
      this.emit(game, io); this.schedule(game, io);
    });
  }

  async restoreRoom(roomId: string, io: Server | null): Promise<boolean> {
    return this.enqueue(roomId, async () => {
      if (this.games.has(roomId)) return true;
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room || room.gameType !== 'SEEP' || !room.engineState || !['PLAYING', 'COMPLETED'].includes(room.status)) return false;
      try {
        const game = JSON.parse(room.engineState) as SeepInternal;
        if (game.rulesVersion !== 'seep-single-deal-v1' || game.roomId !== roomId || ![2, 4].includes(game.order.length)) return false;
        this.games.set(roomId, game);
        if (room.status === 'PLAYING') {
          game.turnExpiresAt = game.phase === 'SETTLING' ? null : Date.now() + TURN_MS;
          this.schedule(game, io, game.phase === 'SETTLING' ? 1 : undefined);
        }
        return true;
      } catch { return false; }
    });
  }

  async handleAction(roomId: string, uid: string, action: string, payload: any, io: Server | null): Promise<ActionResult> {
    return this.enqueue(roomId, async () => {
      const game = this.games.get(roomId);
      if (!game || !game.players[uid]) return { success: false, message: 'Join this table before playing' };
      if (!Number.isInteger(payload?.expectedSequence) || typeof payload?.actionId !== 'string' || payload.actionId.length < 8 || payload.actionId.length > 100) return { success: false, message: 'Refresh the table before playing' };
      if (game.recentActions.some(a => a.id === payload.actionId && a.userId === uid)) return { success: true };
      if (payload.expectedSequence !== game.sequence) return { success: false, message: 'Table changed. Please select your move again.' };
      if (game.currentTurnUserId !== uid) return { success: false, message: 'Wait for your turn' };
      try {
        const next = structuredClone(game);
        if (action === 'BID' && next.phase === 'BIDDING') applyBid(next, payload.bid);
        else if (action === 'PLAY_MOVE' && next.phase === 'PLAYING') {
          const move = legalMoves(next, uid).find(m => m.id === payload.moveId);
          if (!move) return { success: false, message: 'That move is not legal. Select a highlighted action.' };
          applyMove(next, move);
        } else return { success: false, message: 'Invalid action for this phase' };
        next.sequence++;
        next.recentActions = [...next.recentActions.slice(-31), { id: payload.actionId, userId: uid }];
        next.turnExpiresAt = (next as SeepInternal).phase === 'SETTLING' ? null : Date.now() + TURN_MS;
        const saved = await prisma.room.updateMany({ where: { id: roomId, status: 'PLAYING', engineSequence: game.sequence }, data: { engineState: JSON.stringify(next), engineSequence: next.sequence } });
        if (!saved.count) {
          this.cleanupRoom(roomId);
          return { success: false, message: 'Table is unavailable. Reconnect to refresh.' };
        }
        this.games.set(roomId, next);
        this.clearTimer(roomId);
        this.emit(next, io);
        if ((next as SeepInternal).phase === 'SETTLING') await this.settle(next, io);
        else this.schedule(next, io);
        return { success: true, gameState: this.getClientState(roomId, uid) };
      } catch (error: any) { return { success: false, message: error.message || 'Unable to play. Try again.' }; }
    });
  }

  private async settle(game: SeepInternal, io: Server | null): Promise<void> {
    if (game.phase === 'COMPLETED') return;
    this.clearTimer(game.roomId);
    try {
      const tie = game.teams[0].points === game.teams[1].points;
      const winner = tie ? null : game.teams[0].points > game.teams[1].points ? 0 : 1;
      const recipients = game.order.map(id => game.players[id]).filter(p => tie || p.teamIndex === winner).sort((a, b) => a.seatIndex - b.seatIndex);
      const pool = toPaise(game.entryFee) * game.maxPlayers;
      const commission = tie ? 0 : Math.round(pool * await getEffectiveCommissionPercent() / 100);
      const distributable = pool - commission;
      const payouts = recipients.map((p, i) => ({ userId: p.userId, amount: (Math.floor(distributable / recipients.length) + (i < distributable % recipients.length ? 1 : 0)) / 100 }));
      const completed: SeepInternal = { ...game, phase: 'COMPLETED', winningTeamIndex: winner,
        winningUserIds: tie ? [] : recipients.map(p => p.userId), payouts,
        explanation: tie ? 'Draw — all entries returned, no commission.' : `Team ${winner === 0 ? 'A' : 'B'} wins ${game.teams[winner!].points}–${game.teams[1 - winner!].points}.`,
      };
      const settled = await serializable(async tx => {
        const room = await tx.room.findUnique({ where: { id: game.roomId }, include: { players: true } });
        if (!room || room.status !== 'PLAYING') return false;
        const lock = await tx.room.updateMany({ where: { id: game.roomId, status: 'PLAYING', engineSequence: game.sequence }, data: { status: 'COMPLETED' } });
        if (!lock.count) return false;
        for (const p of room.players) await moveWallet(tx, p.userId, 0, -game.entryFee);
        for (const payout of payouts) {
          await moveWallet(tx, payout.userId, payout.amount);
          await tx.transaction.create({ data: {
            userId: payout.userId, amount: payout.amount, type: tie ? 'REFUND' : 'ROOM_WIN', referenceId: game.roomId,
            idempotencyKey: `room-seep:${game.roomId}:${payout.userId}`,
            description: `${tie ? 'Draw refund' : 'Won Seep'} Table #${room.roomCode}`,
          } });
        }
        await tx.room.update({ where: { id: game.roomId }, data: {
          winnerId: tie ? null : recipients[0].userId, winnerPrize: tie ? 0 : distributable / 100,
          engineState: JSON.stringify(completed), customConfig: JSON.stringify({ ...publicRoomConfig(room.customConfig),
            rulesVersion: game.rulesVersion, winnerUserIds: completed.winningUserIds, winningTeamIndex: winner, payouts,
            team0Points: game.teams[0].points, team1Points: game.teams[1].points,
            platformCommission: commission / 100, settledPool: pool / 100, explanation: completed.explanation,
          }),
        } });
        return true;
      });
      if (!settled) { this.cleanupRoom(game.roomId); return; }
      this.games.set(game.roomId, completed);
      this.emit(completed, io);
      io?.to(`room:${game.roomId}`).emit('game_finished', { roomId: game.roomId, winnerUserIds: completed.winningUserIds });
      for (const uid of game.order) {
        const wallet = await walletService.getWallet(uid).catch(() => null);
        if (wallet) io?.to(`user:${uid}`).emit('balance_updated', wallet);
      }
      const { gameManager } = await import('../../game.manager');
      await gameManager.broadcastRoomUpdate(game.roomId);
      await gameManager.broadcastLobbyUpdate();
    } catch (error) {
      console.error('[Seep] Settlement will retry:', error instanceof Error ? error.message : 'unknown error');
      this.schedule(game, io, 5000);
    }
  }

  private emit(game: SeepInternal, io: Server | null) {
    for (const uid of game.order) io?.to(`user:${uid}`).emit('seep_state', clientState(game, uid));
    // Public room messages contain only public state; hands are sent via authenticated user channels.
    io?.to(`room:${game.roomId}`).emit('seep_public_state', clientState(game));
  }
  getClientState(roomId: string, uid?: string) {
    const game = this.games.get(roomId);
    return game ? clientState(game, uid) : null;
  }
  private clearTimer(id: string) { const timer = this.timers.get(id); if (timer) clearTimeout(timer); this.timers.delete(id); }
  private schedule(game: SeepInternal, io: Server | null, delay?: number) {
    this.clearTimer(game.roomId);
    if (game.phase === 'COMPLETED') return;
    const timer = setTimeout(() => {
      if (game.phase === 'SETTLING') { void this.enqueue(game.roomId, () => this.settle(game, io)); return; }
      const uid = game.currentTurnUserId!;
      const move = legalMoves(game, uid).sort((a, b) => (a.type === 'CAPTURE' ? 0 : a.type === 'THROW' ? 2 : 1) - (b.type === 'CAPTURE' ? 0 : b.type === 'THROW' ? 2 : 1))[0];
      const payload = { actionId: `auto-${game.sequence}-${Date.now()}`, expectedSequence: game.sequence,
        bid: game.phase === 'BIDDING' ? bidOptions(game)[0] : undefined, moveId: move?.id };
      void this.handleAction(game.roomId, uid, game.phase === 'BIDDING' ? 'BID' : 'PLAY_MOVE', payload, io).then(result => {
        if (!result.success && this.games.get(game.roomId) === game) this.schedule(game, io, 5000);
      }).catch(() => { if (this.games.get(game.roomId) === game) this.schedule(game, io, 5000); });
    }, delay ?? Math.max(1, (game.turnExpiresAt || Date.now() + TURN_MS) - Date.now()));
    timer.unref?.(); this.timers.set(game.roomId, timer);
  }
  cleanupRoom(id: string) { this.clearTimer(id); this.games.delete(id); }
  stopAllTimers() { for (const id of this.timers.keys()) this.clearTimer(id); }
}
export const seepEngine = new SeepEngine();
