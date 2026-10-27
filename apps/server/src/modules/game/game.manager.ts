import crypto from 'crypto';
import { moveWallet } from '../../wallet-ledger';
import { Server } from 'socket.io';
import { serializable } from '../../transaction';
import { money, toPaise } from '../../money';
import { prisma } from '../../db';
import { walletService } from '../wallet/wallet.service';
import { notificationService } from '../notification/notification.service';
import { gameRegistry } from './game.registry';
import { RoomWithPlayers } from './engine.interface';
import { publicRoomConfig, invitationUnavailable } from './room-presentation';

export class GameManager {
  private io: Server | null = null;

  setSocketServer(io: Server) {
    this.io = io;
  }

  /**
   * Create a new game room
   */
  async createRoom(
    hostUserId: string,
    amount: number,
    maxPlayers: number,
    guessNumber?: number | null,
    gameType: string = 'GUESS_NUMBER',
    customConfig?: Record<string, any>,
    isPrivate: boolean = false
  ) {
    const entryFee = money(amount, 1);
    if (!gameRegistry.has(gameType)) {
      throw new Error(`Unsupported game type: ${gameType}`);
    }
    const engine = gameRegistry.get(gameType);
    if (engine.descriptor.enabled === false) {
      throw new Error(`${engine.descriptor.name} is currently disabled`);
    }

    engine.validateCreateOptions({
      entryFee,
      maxPlayers,
      guessNumber: guessNumber ?? undefined,
      customConfig,
    });

    let sanitizedConfig: Record<string, any> | null = null;
    if (customConfig && typeof customConfig === 'object') {
      const { playerStakes, settledPool, platformCommission, twentyNineState, engineState, ...rest } = customConfig;
      if (Object.keys(rest).length > 0) {
        sanitizedConfig = rest;
      }
    }

    const invitationToken = 'inv-' + crypto.randomBytes(12).toString('hex');

    const room = await serializable(async tx => {
      const created = await tx.room.create({
        data: {
          roomCode: 'R-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
          invitationToken,
          invitationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          isPrivate: Boolean(isPrivate),
          gameType,
          entryFee,
          maxPlayers,
          customConfig: sanitizedConfig ? JSON.stringify(sanitizedConfig) : null,
        },
      });

      await walletService.lockRoomEntry(
        tx,
        hostUserId,
        created.id,
        entryFee,
        guessNumber ?? null,
        0, // Host gets seat 0
        gameType === 'TEEN_PATTI'
      );

      return created;
    });

    await this.broadcastLobbyUpdate();
    return this.getRoomDetails(room.id, hostUserId);
  }

  /**
   * Join an existing game room
   */
  async joinRoom(
    userId: string,
    roomCode: string,
    guessNumber?: number | null,
    seatIndex?: number
  ) {
    if (typeof roomCode !== 'string') throw new Error('Room code is required');
    roomCode = roomCode.trim().toUpperCase();

    // Pre-check room and engine validation before transaction
    const initialRoom = await prisma.room.findUnique({
      where: { roomCode },
      include: {
        players: {
          include: { user: { select: { id: true, username: true } } },
          orderBy: { seatIndex: 'asc' },
        },
      },
    });

    if (!initialRoom) throw new Error('Room not found');

    if (!gameRegistry.has(initialRoom.gameType)) {
      throw new Error(`Unsupported game type: ${initialRoom.gameType}`);
    }
    const engine = gameRegistry.get(initialRoom.gameType);
    if (engine.descriptor.enabled === false) {
      throw new Error(`${engine.descriptor.name} is currently disabled`);
    }

    engine.validateJoin(initialRoom as unknown as RoomWithPlayers, userId, {
      guessNumber: guessNumber ?? undefined,
      seatIndex,
    });

    const result = await serializable(async tx => {
      // Write-lock room to prevent concurrent overfill
      const locked = await tx.room.updateMany({
        where: { roomCode, status: 'WAITING' },
        data: { status: 'WAITING' },
      });
      if (locked.count !== 1) throw new Error('Room is not available to join');

      const room = await tx.room.findUniqueOrThrow({
        where: { roomCode },
        include: { players: true },
      });

      if (room.players.length >= room.maxPlayers) throw new Error('Room is already full');
      if (invitationUnavailable(room)) throw new Error('Invitation expired or revoked; ask the host for a new link or code');

      await walletService.lockRoomEntry(
        tx,
        userId,
        room.id,
        room.entryFee,
        guessNumber ?? null,
        seatIndex,
        room.gameType === 'TEEN_PATTI'
      );

      const full = room.players.length + 1 === room.maxPlayers;
      if (full) {
        const nextStatus = room.gameType === 'GUESS_NUMBER' ? 'COUNTDOWN' : 'PLAYING';
        await tx.room.update({ where: { id: room.id }, data: { status: nextStatus } });
      }

      return { id: room.id, gameType: room.gameType, full };
    });

    const updatedRoom = await this.getRoomDetails(result.id, userId);

    // Trigger engine hooks if table is full or for ongoing sports pool tracking
    if (result.full) {
      if (result.gameType === 'GUESS_NUMBER') {
        const legacyEngine = gameRegistry.get('GUESS_NUMBER');
        void legacyEngine.startGame(result.id, this.io);
      } else {
        await engine.onPlayerJoined(updatedRoom as unknown as RoomWithPlayers, userId, this.io);
      }
    } else if (result.gameType === 'SPORTS_MATCH') {
      await engine.onPlayerJoined(updatedRoom as unknown as RoomWithPlayers, userId, this.io);
    }

    await this.broadcastRoomUpdate(result.id);
    await this.broadcastLobbyUpdate();
    return this.getRoomDetails(result.id, userId);
  }

  /**
   * Handle real-time in-game player action
   */
  async handlePlayerAction(roomId: string, userId: string, action: string, payload: any) {
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { gameType: true } });
    if (!room) throw new Error('Room not found');

    const engine = gameRegistry.get(room.gameType);
    if (room.gameType === 'TWENTY_NINE' && (!Number.isInteger(payload?.expectedSequence) || typeof payload?.actionId !== 'string' || payload.actionId.length < 8 || payload.actionId.length > 100)) {
      return { success: false, message: 'Refresh the table before acting (sequence and action ID required)' };
    }
    return engine.handleAction(roomId, userId, action, payload, this.io);
  }

  stopTimers() {
    for (const desc of gameRegistry.listGames()) {
      const engine = gameRegistry.get(desc.id);
      if ('stopAllTimers' in engine && typeof (engine as any).stopAllTimers === 'function') {
        (engine as any).stopAllTimers();
      }
    }
  }

  async cancelWaitingRoom(roomId: string, userId: string) {
    return this.refundRoom(roomId, userId);
  }

  /**
   * Admin cancels any active table (WAITING, COUNTDOWN, ROLLING, PLAYING)
   * and automatically distributes 100% refund of entry fees & in-game stakes to all participants.
   */
  async cancelRoomByAdmin(roomId: string, adminId: string, reason?: string) {
    const existing = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        players: {
          include: {
            user: { select: { id: true, username: true } },
          },
        },
      },
    });

    if (!existing) {
      throw new Error('Table not found');
    }

    if (existing.status === 'COMPLETED') {
      throw new Error(`Cannot cancel table #${existing.roomCode}: Table has already completed`);
    }

    if (existing.status === 'CANCELLED') {
      throw new Error(`Table #${existing.roomCode} is already cancelled`);
    }

    if (!['WAITING', 'COUNTDOWN', 'ROLLING', 'PLAYING'].includes(existing.status)) {
      throw new Error(`Cannot cancel table #${existing.roomCode} with status '${existing.status}'`);
    }

    let totalRefundPaise = 0;
    const playerRefunds: { userId: string; username: string; amount: number }[] = [];

    const players = await serializable(async tx => {
      // Concurrency lock: Ensure table is still active
      const locked = await tx.room.updateMany({
        where: {
          id: roomId,
          status: { in: ['WAITING', 'COUNTDOWN', 'ROLLING', 'PLAYING'] },
        },
        data: { status: 'CANCELLED' },
      });

      if (locked.count !== 1) {
        throw new Error('Table is no longer active or was settled concurrently');
      }

      let configObj: Record<string, any> = {};
      try {
        if (existing.customConfig) configObj = JSON.parse(existing.customConfig);
      } catch (_) {}
      const playerStakes = configObj.playerStakes || {};

      for (const player of existing.players) {
        const inGameStake = existing.status !== 'WAITING' && typeof playerStakes[player.userId] === 'number'
          ? playerStakes[player.userId]
          : 0;
        const totalRefundPaiseForPlayer = toPaise(existing.entryFee) + toPaise(inGameStake);
        const totalRefund = totalRefundPaiseForPlayer / 100;
        totalRefundPaise += totalRefundPaiseForPlayer;
        playerRefunds.push({
          userId: player.userId,
          username: player.user?.username || 'Player',
          amount: totalRefund,
        });

        await moveWallet(tx, player.userId, totalRefund, -totalRefund);

        const entryTx = await tx.transaction.findFirst({
          where: { userId: player.userId, referenceId: roomId, type: 'ROOM_ENTRY' },
        });
        if (entryTx) {
          await tx.transaction.create({
            data: {
              userId: player.userId,
              amount: totalRefund,
              type: 'REFUND',
              referenceId: roomId,
              idempotencyKey: `admin-room-refund:${roomId}:${player.userId}`,
              description: `Table #${existing.roomCode} cancelled by admin. Entry and stakes refunded: ₹${totalRefund.toFixed(2)}${reason ? ` (${reason})` : ''}`,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'CANCEL_TABLE',
          details: JSON.stringify({
            roomId,
            roomCode: existing.roomCode,
            gameType: existing.gameType,
            statusBeforeCancel: existing.status,
            refundCount: existing.players.length,
            totalRefundAmount: totalRefundPaise / 100,
            playerRefunds,
            reason: reason || 'Admin cancelled active table',
          }),
        },
      });

      return existing.players;
    });

    // Cleanup engine in-memory state and stop any active timers
    const engine = gameRegistry.get(existing.gameType);
    if (engine) {
      engine.cleanupRoom(roomId);
    }

    // Real-time notifications and balance updates for all participants
    for (const p of playerRefunds) {
      const updatedWallet = await walletService.getWallet(p.userId);
      this.io?.to(`user:${p.userId}`).emit('balance_updated', updatedWallet);
      this.io?.to(`user:${p.userId}`).emit('wallet_updated', updatedWallet);

      void notificationService.create({
        userId: p.userId,
        title: 'Table Cancelled & Refunded',
        message: `Table #${existing.roomCode} was cancelled by administrator. ₹${p.amount.toFixed(2)} has been refunded to your wallet.${reason ? ` Reason: ${reason}` : ''}`,
        type: 'SYSTEM',
        metadata: {
          roomId,
          roomCode: existing.roomCode,
          refundAmount: p.amount,
          reason,
        },
      }).catch(err => console.error(`[AdminCancel] Notification failed for ${p.userId}:`, err?.message));
    }

    await this.broadcastRoomUpdate(roomId);
    this.io?.to(`room:${roomId}`).emit('room_cancelled', {
      roomId,
      roomCode: existing.roomCode,
      reason: reason || 'Table cancelled by administrator',
    });
    await this.broadcastLobbyUpdate();

    return {
      success: true,
      message: `Table #${existing.roomCode} successfully cancelled. ₹${(totalRefundPaise / 100).toFixed(2)} refunded across ${players.length} participant(s).`,
      roomId,
      roomCode: existing.roomCode,
      refundedCount: players.length,
      totalRefunded: totalRefundPaise / 100,
      playerRefunds,
    };
  }

  private async refundRoom(roomId: string, userId?: string) {
    const players = await serializable(async tx => {
      const room = await tx.room.findUnique({ where: { id: roomId }, include: { players: true } });
      if (!room) throw new Error('Room not found');
      if (userId && !room.players.some(p => p.userId === userId)) throw new Error('Only participants can cancel a room');
      if (userId && room.status !== 'WAITING') throw new Error('Only waiting rooms can be cancelled');
      if (userId && room.gameType === 'SPORTS_MATCH') {
        const isHost = room.players[0]?.userId === userId;
        if (!isHost) throw new Error('Only the room creator can cancel this pool');
        if (room.players.length > 1) {
          throw new Error('Cannot cancel pool once other players have joined');
        }
      }
      if (!['WAITING', 'COUNTDOWN', 'ROLLING', 'PLAYING'].includes(room.status)) return [];

      await tx.room.update({ where: { id: roomId }, data: { status: 'CANCELLED' } });

      let configObj: Record<string, any> = {};
      try {
        if (room.customConfig) configObj = JSON.parse(room.customConfig);
      } catch (_) {}
      const playerStakes = configObj.playerStakes || {};

      for (const player of room.players) {
        const inGameStake = room.status !== 'WAITING' && typeof playerStakes[player.userId] === 'number'
          ? playerStakes[player.userId]
          : 0;
        const totalRefund = (toPaise(room.entryFee) + toPaise(inGameStake)) / 100;

        await moveWallet(tx, player.userId, totalRefund, -totalRefund);

        const entryTx = await tx.transaction.findFirst({
          where: { userId: player.userId, referenceId: roomId, type: 'ROOM_ENTRY' },
        });
        if (entryTx) {
          await tx.transaction.create({
            data: {
              userId: player.userId,
              amount: totalRefund,
              type: 'REFUND',
              referenceId: roomId,
              idempotencyKey: `room-refund:${roomId}:${player.userId}`,
              description: `Cancelled game entry and stakes refunded for Room #${room.roomCode}`,
            },
          });
        }
      }
      return room.players;
    });

    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { gameType: true } });
    if (room) {
      const engine = gameRegistry.get(room.gameType);
      engine.cleanupRoom(roomId);
    }

    for (const player of players) {
      this.io?.to(`user:${player.userId}`).emit('balance_updated', await walletService.getWallet(player.userId));
    }

    await this.broadcastRoomUpdate(roomId);
    await this.broadcastLobbyUpdate();
  }

  async recoverInterruptedRooms() {
    const rooms = await prisma.room.findMany({
      where: {
        status: { in: ['WAITING', 'COUNTDOWN', 'ROLLING', 'PLAYING'] },
        gameType: { not: 'SPORTS_MATCH' },
      },
      select: { id: true, gameType: true, status: true },
    });
    for (const room of rooms) {
      try {
        if (room.gameType === 'TWENTY_NINE' && room.status === 'PLAYING') {
          const engine = gameRegistry.get('TWENTY_NINE');
          if (engine && typeof (engine as any).restoreRoom === 'function') {
            const restored = await (engine as any).restoreRoom(room.id, this.io);
            if (restored) continue;
          }
        }
        await this.refundRoom(room.id);
      } catch (err: any) {
        console.error(`[Recovery] Failed to recover room ${room.id}:`, err?.message || err);
      }
    }
  }

  /**
   * Helper to fetch full room info with player details and sanitized game state
   */
  async getRoomDetails(roomId: string, forUserId?: string, invitationToken?: string) {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        players: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatar: true } },
          },
          orderBy: { seatIndex: 'asc' },
        },
        winner: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
      },
    });

    if (!room) return null;

    const isParticipant = Boolean(forUserId && room.players.some(p => p.userId === forUserId));
    const isHost = Boolean(forUserId && (room.players.find(p => p.seatIndex === 0)?.userId === forUserId || room.players[0]?.userId === forUserId));

    // If room is private, unauthorized outsiders cannot view unless completed or presenting valid invite authorization
    if (room.isPrivate && !isParticipant) {
      const cleanToken = invitationToken?.trim();
      const hasAuth = !invitationUnavailable(room) && cleanToken && (
        cleanToken === room.invitationToken ||
        cleanToken.toUpperCase() === room.roomCode
      );
      if (!hasAuth) {
        return null;
      }
    }

    const engine = gameRegistry.get(room.gameType);
    if (room.gameType === 'TWENTY_NINE' && !engine.getClientState(roomId) && room.status === 'COMPLETED') {
      await (engine as any).restoreRoom(roomId, null);
    }
    const gameState = engine ? engine.getClientState(roomId, forUserId) : null;
    const { engineState, engineSequence, ...publicRoom } = room;
    return {
      ...publicRoom,
      invitationToken: isHost ? room.invitationToken : undefined,
      customConfig: publicRoomConfig(room.customConfig),
      gameState,
    };
  }

  /**
   * Helper to fetch full room info by room code
   */
  async getRoomByCode(roomCode: string, forUserId?: string) {
    if (typeof roomCode !== 'string') return null;
    const room = await prisma.room.findUnique({
      where: { roomCode: roomCode.trim().toUpperCase() },
      include: {
        players: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatar: true } },
          },
          orderBy: { seatIndex: 'asc' },
        },
        winner: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
      },
    });

    if (!room) return null;
    const participant = Boolean(forUserId && room.players.some(p => p.userId === forUserId));
    if (!participant && invitationUnavailable(room)) return null;

    const isHost = Boolean(forUserId && (room.players.find(p => p.seatIndex === 0)?.userId === forUserId || room.players[0]?.userId === forUserId));
    const engine = gameRegistry.get(room.gameType);
    const gameState = engine ? engine.getClientState(room.id, forUserId) : null;
    const { engineState, engineSequence, ...publicRoom } = room;
    return {
      ...publicRoom,
      invitationToken: isHost ? room.invitationToken : undefined,
      customConfig: publicRoomConfig(room.customConfig),
      gameState,
    };
  }

  /**
   * Get preview information for an invitation token without reserving a seat
   */
  async getRoomPreviewByInvitation(token: string) {
    if (typeof token !== 'string') return null;
    const cleanToken = token.trim();
    const room = await prisma.room.findFirst({
      where: {
        OR: [
          { invitationToken: cleanToken },
          { roomCode: cleanToken.toUpperCase() },
        ],
      },
      include: {
        players: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatar: true } },
          },
          orderBy: { seatIndex: 'asc' },
        },
      },
    });

    if (!room) return null;

    const hostPlayer = room.players.find(p => p.seatIndex === 0) || room.players[0];
    const hostUser = hostPlayer?.user;

    const expired = invitationUnavailable(room);
    const isAvailable = !expired && room.status === 'WAITING' && room.players.length < room.maxPlayers;
    let unavailabilityReason: 'FULL' | 'STARTED' | 'CANCELLED' | 'EXPIRED' | 'NOT_FOUND' | null = null;
    if (expired) unavailabilityReason = 'EXPIRED';
    else if (room.status === 'CANCELLED') unavailabilityReason = 'CANCELLED';
    else if (room.status !== 'WAITING') unavailabilityReason = 'STARTED';
    else if (room.players.length >= room.maxPlayers) unavailabilityReason = 'FULL';

    return {
      id: room.id,
      roomCode: room.roomCode,
      invitationToken: room.invitationToken || room.roomCode,
      gameType: room.gameType,
      entryFee: room.entryFee,
      maxPlayers: room.maxPlayers,
      occupiedSeats: room.players.length,
      status: room.status,
      isPrivate: room.isPrivate,
      rulesVersion: room.gameType === 'TWENTY_NINE' ? 'single-deal-v1' : undefined,
      rulesSummary: room.gameType === 'TWENTY_NINE' ? 'Single deal · 8 tricks · bids 16–28 · 28 card points · hidden trump · 20s turns · 30s disconnect grace once per player · equal team payout, odd paise to lower seat' : undefined,
      takenNumbers: room.gameType === 'GUESS_NUMBER' ? room.players.map(p => p.guessNumber).filter(n => n !== null) : undefined,
      teams: room.gameType === 'SPORTS_MATCH' ? [publicRoomConfig(room.customConfig)?.team1?.name || 'Team 1', publicRoomConfig(room.customConfig)?.team2?.name || 'Team 2'] : undefined,
      host: {
        id: hostUser?.id || '',
        username: hostUser?.username || 'Host',
        displayName: (hostUser as any)?.displayName || hostUser?.username || 'Host',
        avatar: (hostUser as any)?.avatar || 'avatar_1',
      },
      available: isAvailable,
      unavailabilityReason,
    };
  }

  /**
   * Join a room via invitation token with explicit user action
   */
  async joinRoomByInvitation(
    userId: string,
    invitationToken: string,
    guessNumber?: number | null,
    seatIndex?: number
  ) {
    if (typeof invitationToken !== 'string') throw new Error('Invitation token is required');
    const cleanToken = invitationToken.trim();
    const room = await prisma.room.findFirst({
      where: {
        OR: [
          { invitationToken: cleanToken },
          { roomCode: cleanToken.toUpperCase() },
        ],
      },
      select: { roomCode: true },
    });

    if (!room) throw new Error('Room not found with provided invitation');
    return this.joinRoom(userId, room.roomCode, guessNumber, seatIndex);
  }

  /**
   * Fetch all open/active rooms for the lobby (includes public rooms + private rooms user is participating in)
   */
  async getActiveRooms(forUserId?: string) {
    const whereClause: any = {
      status: { in: ['WAITING', 'COUNTDOWN', 'ROLLING', 'PLAYING'] },
    };

    if (forUserId) {
      whereClause.OR = [
        { isPrivate: false },
        { isPrivate: true, players: { some: { userId: forUserId } } },
      ];
    } else {
      whereClause.isPrivate = false;
    }

    const rooms = await prisma.room.findMany({
      where: whereClause,
      include: {
        players: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatar: true } },
          },
          orderBy: { seatIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: forUserId ? undefined : 30,
    });

    return rooms.filter((r, i) => i < 30 || r.players.some(p => p.userId === forUserId)).map(room => {
      const { engineState, engineSequence, invitationToken, ...publicRoom } = room;
      return { ...publicRoom, customConfig: publicRoomConfig(room.customConfig) };
    });
  }

  async updateInvitation(roomId: string, userId: string, operation: 'REVOKE' | 'RENEW') {
    await serializable(async tx => {
      const room = await tx.room.findUnique({ where: { id: roomId }, include: { players: true } });
      if (!room || room.players.find(p => p.seatIndex === 0)?.userId !== userId) throw new Error('Only the host can manage invitations');
      if (room.status !== 'WAITING') throw new Error('Only waiting-room invitations can be changed');
      await tx.room.update({ where: { id: roomId }, data: {
        roomCode: 'R-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        invitationToken: 'inv-' + crypto.randomBytes(12).toString('hex'),
        invitationRevokedAt: operation === 'REVOKE' ? new Date() : null,
        invitationExpiresAt: operation === 'RENEW' ? new Date(Date.now() + 86400000) : new Date(),
      } });
    });
    await this.broadcastRoomUpdate(roomId);
    await this.broadcastLobbyUpdate();
    return this.getRoomDetails(roomId, userId);
  }

  private async broadcastRoomUpdate(roomId: string) {
    if (!this.io) return;
    const room = await prisma.room.findUnique({ where: { id: roomId }, include: {
      players: { include: { user: { select: { id: true, username: true, displayName: true, avatar: true } } }, orderBy: { seatIndex: 'asc' } },
    } });
    if (!room) return;
    const { engineState, engineSequence, invitationToken, ...publicRoom } = room;
    this.io.to(`room:${roomId}`).emit('room_updated', { ...publicRoom, customConfig: publicRoomConfig(room.customConfig) });
  }

  /** General events never contain private tables. Clients refresh their authenticated listing. */
  async broadcastLobbyUpdate() {
    if (this.io) this.io.emit('lobby_rooms_updated', await this.getActiveRooms());
  }
}
export const gameManager = new GameManager();
