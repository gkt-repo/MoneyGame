import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Router, Request, Response } from 'express';
import { walletService } from '../modules/wallet/wallet.service';
import { paymentService } from '../modules/payment/payment.service';
import { gameManager } from '../modules/game/game.manager';
import { adminService } from '../modules/admin/admin.service';
import { config } from '../config';
import { authRouter, adminAuthRouter } from './auth.routes';
import {
  authenticateUser,
  authenticateAdmin,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db';

export const router = Router();

const isTest = process.env.NODE_ENV === 'test';

import {
  authLimiter,
  sessionLimiter,
  depositLimiter,
  claimLimiter,
  webhookLimiter,
} from '../middleware/rate-limiter';
export { depositLimiter, claimLimiter, webhookLimiter };

// ─── Health Check Endpoint (Deep DB Probe) ───────────────────────────────────
router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({
      status: 'ok',
      database: 'connected',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'degraded',
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ─── Authentication Endpoints ────────────────────────────────────────────────
// Mount public auth routers (individual endpoints apply strict authLimiter / sessionLimiter)
router.use('/auth', authRouter);
router.use('/v1/auth', authRouter);
router.use('/admin/auth', adminAuthRouter);
router.use('/v1/admin/auth', adminAuthRouter);

// ─── User Profile & Wallet (Protected) ───────────────────────────────────────

router.get('/user/me', authenticateUser, (req: AuthenticatedRequest, res: Response): void => {
  res.json({ success: true, user: req.user });
});

router.get('/user/wallet', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const wallet = await walletService.getWallet(userId);
    res.json({ success: true, wallet });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Legacy direct user endpoint for backwards compatibility
router.get('/wallet/:userId', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    if (userId !== req.user!.id) { res.status(403).json({ error: 'Access denied' }); return; }
    const wallet = await walletService.getWallet(userId);
    res.json({ success: true, wallet });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Payment & Deposits ───────────────────────────────────────────────────────

router.post('/deposits/create', authenticateUser, depositLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const amount = req.body.amount;
    if (!userId || !amount) {
      res.status(400).json({ error: 'userId and amount are required' });
      return;
    }
    const depositData = await paymentService.createDepositRequest(userId, Number(amount));
    res.json({ success: true, ...depositData });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/deposits/claim-utr', authenticateUser, claimLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { depositId, utr } = req.body;
    if (!depositId || !utr) {
      res.status(400).json({ error: 'depositId and utr are required' });
      return;
    }
    const result = await paymentService.claimDepositUtr(req.user!.id, depositId, utr);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/deposits/status/:depositId', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const depositId = Array.isArray(req.params.depositId) ? req.params.depositId[0] : req.params.depositId;
    const result = await paymentService.getDepositStatus(depositId, req.user!.id);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.get('/deposits/my', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const deposits = await paymentService.getUserDeposits(req.user!.id);
    res.json({ success: true, deposits });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/user/deposits/my', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const deposits = await paymentService.getUserDeposits(req.user!.id);
    res.json({ success: true, deposits });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/user/transactions', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const transactions = await walletService.getUserTransactions(req.user!.id);
    res.json({ success: true, transactions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Withdrawals ──────────────────────────────────────────────────────────────

router.post('/withdrawals/request', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { amount, upiId } = req.body;
    if (!userId || !amount || !upiId) {
      res.status(400).json({ error: 'userId, amount, and upiId are required' });
      return;
    }
    const result = await walletService.requestWithdrawal(userId, Number(amount), upiId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/withdrawals/my', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const withdrawals = await walletService.getUserWithdrawals(userId);
    res.json({ success: true, withdrawals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/withdrawals/user/:userId', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    if (userId !== req.user!.id) { res.status(403).json({ error: 'Access denied' }); return; }
    const withdrawals = await walletService.getUserWithdrawals(userId);
    res.json({ success: true, withdrawals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Game Types & Rooms ───────────────────────────────────────────────────────

router.get('/games', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { gameRegistry } = await import('../modules/game/game.registry');
    const games = gameRegistry.listGames();
    res.json({ success: true, games });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/rooms', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rooms = await gameManager.getActiveRooms();
    res.json({ success: true, rooms });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rooms/create', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { entryFee, maxPlayers, guessNumber, gameType, customConfig } = req.body;
    if (!userId || entryFee === undefined || maxPlayers === undefined) {
      res.status(400).json({ error: 'userId, entryFee, and maxPlayers are required' });
      return;
    }
    const room = await gameManager.createRoom(
      userId,
      Number(entryFee),
      Number(maxPlayers),
      guessNumber !== undefined && guessNumber !== null ? Number(guessNumber) : null,
      gameType || 'GUESS_NUMBER',
      customConfig
    );
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/rooms/join', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { roomCode, guessNumber, seatIndex } = req.body;
    if (!userId || !roomCode) {
      res.status(400).json({ error: 'userId and roomCode are required' });
      return;
    }
    const room = await gameManager.joinRoom(
      userId,
      roomCode,
      guessNumber !== undefined && guessNumber !== null ? Number(guessNumber) : null,
      seatIndex !== undefined ? Number(seatIndex) : undefined
    );
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/rooms/:roomId/action', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const roomId = String(req.params.roomId);
    const userId = req.user!.id;
    const { action, payload } = req.body;
    if (!action) {
      res.status(400).json({ error: 'action is required' });
      return;
    }
    const result = await gameManager.handlePlayerAction(roomId, userId, action, payload);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/rooms/by-code/:code', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawCode = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: 'Room code is required' });
      return;
    }

    let userId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, config.jwtSecret, {
          algorithms: ['HS256'],
          audience: [config.userAudience, config.adminAudience],
        }) as any;
        if (decoded?.userId) {
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, status: true },
          });
          if (user && user.status === 'ACTIVE') {
            userId = user.id;
          }
        }
      } catch (_) {
        // spectator fallback
      }
    }

    const room = await gameManager.getRoomByCode(code, userId);
    if (!room) {
      res.status(404).json({ error: `Room not found with code ${code}` });
      return;
    }
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/rooms/:roomId', async (req: Request, res: Response): Promise<void> => {
  try {
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    // Extract userId from verified auth token if present
    let userId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, config.jwtSecret, {
          algorithms: ['HS256'],
          audience: [config.userAudience, config.adminAudience],
        }) as any;
        if (decoded?.userId) {
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, status: true },
          });
          if (user && user.status === 'ACTIVE') {
            userId = user.id;
          }
        }
      } catch (_) {
        // Invalid, expired, or forged token: treated as unauthenticated spectator
      }
    }

    const room = await gameManager.getRoomDetails(roomId, userId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rooms/:roomId/cancel', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const roomId = String(req.params.roomId);
    await gameManager.cancelWaitingRoom(roomId, req.user!.id);
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ─── Sports Pool & Live Matches Endpoints ─────────────────────────────────────
router.get('/sports/matches', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sportsService } = await import('../modules/game/engines/sports-match/sports.service');
    const sport = typeof req.query.sport === 'string' ? req.query.sport : undefined;
    const matches = await sportsService.getAllMatches(sport);
    res.json({ success: true, matches });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sports/matches/:matchId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sportsService } = await import('../modules/game/engines/sports-match/sports.service');
    const matchId = String(req.params.matchId);
    const match = await sportsService.getMatchById(matchId);
    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }
    res.json({ success: true, match });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sports/sync', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { sportsService } = await import('../modules/game/engines/sports-match/sports.service');
    await sportsService.checkAndSyncRooms();
    res.json({ success: true, message: 'Sync complete' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sports/rooms/:roomId/settle', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const roomId = String(req.params.roomId);
    const { winningTeamIndex, winningTeamName, refund } = req.body;
    const { sportsService } = await import('../modules/game/engines/sports-match/sports.service');

    if (refund) {
      const result = await sportsService.settleSportsPool(roomId, 999, 'Match Cancelled / Refunded');
      res.json({ success: true, settlement: result });
      return;
    }

    if (winningTeamIndex === undefined || winningTeamIndex === null) {
      res.status(400).json({ error: 'winningTeamIndex is required (1 or 2)' });
      return;
    }

    const result = await sportsService.settleSportsPool(roomId, Number(winningTeamIndex), winningTeamName);
    res.json({ success: true, settlement: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Automated Webhook Receiver (Android Notification / Email Forwarder) ───────

async function isWebhookAuthorized(authHeader?: string | string[]): Promise<boolean> {
  const expectedSecret = config.webhookSecret;
  const supplied = typeof authHeader === 'string' ? authHeader.replace(/^Bearer /, '') : '';
  if (expectedSecret && supplied && Buffer.byteLength(supplied) === Buffer.byteLength(expectedSecret)) {
    if (crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expectedSecret))) {
      return true;
    }
  }
  if (supplied) {
    try {
      const decoded = jwt.verify(supplied, config.jwtSecret, {
        algorithms: ['HS256'],
        audience: [config.adminAudience],
      }) as any;
      if (decoded?.userId) {
        const adminUser = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, role: true, status: true },
        });
        if (
          adminUser &&
          adminUser.status === 'ACTIVE' &&
          (adminUser.role === 'ADMIN' || adminUser.role === 'SUPER_ADMIN')
        ) {
          return true;
        }
      }
    } catch {
      // not an authorized admin jwt
    }
  }
  return false;
}

router.post('/webhooks/upi-notify', webhookLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers['x-webhook-secret'] || req.headers['authorization'];
    if (!(await isWebhookAuthorized(authHeader))) {
      res.status(401).json({ error: 'Unauthorized webhook request' });
      return;
    }

    const { amount, utr, senderUpi, senderName } = req.body;
    if (!amount) {
      res.status(400).json({ error: 'Payment amount is required' });
      return;
    }

    const result = await paymentService.verifyIncomingPayment(Number(amount), utr, {
      senderUpi,
      senderName,
      rawPayload: req.body,
    });

    res.json(result);
  } catch (err: any) {
    res.status(err.code?.startsWith('P') ? 503 : 400).json({ error: err.message });
  }
});

// Listener heartbeat endpoint for Android phone watchdog
router.post('/webhooks/listener-heartbeat', webhookLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers['x-webhook-secret'] || req.headers['authorization'];
    if (!(await isWebhookAuthorized(authHeader))) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { batteryLevel, phoneModel } = req.body || {};

    // Persist heartbeat in DB for watchdog
    await prisma.systemSetting.upsert({
      where: { key: 'last_listener_heartbeat' },
      update: { value: new Date().toISOString() },
      create: { key: 'last_listener_heartbeat', value: new Date().toISOString() },
    });

    if (batteryLevel !== undefined || phoneModel !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: 'listener_metadata' },
        update: { value: JSON.stringify({ batteryLevel, phoneModel, updatedAt: new Date().toISOString() }) },
        create: { key: 'listener_metadata', value: JSON.stringify({ batteryLevel, phoneModel, updatedAt: new Date().toISOString() }) },
      });
    }

    res.json({
      status: 'ok',
      acknowledgedAt: new Date().toISOString(),
      receivedMeta: { batteryLevel, phoneModel },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin Listener Management Endpoints ──────────────────────────────────────

router.get('/admin/listener-config', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const lastHeartbeat = await prisma.systemSetting.findUnique({ where: { key: 'last_listener_heartbeat' } });
    const metaSetting = await prisma.systemSetting.findUnique({ where: { key: 'listener_metadata' } });
    let listenerMetadata = null;
    if (metaSetting?.value) {
      try { listenerMetadata = JSON.parse(metaSetting.value); } catch {}
    }
    const lastHeartbeatAt = lastHeartbeat?.value || null;
    const isOnline = lastHeartbeatAt
      ? Date.now() - new Date(lastHeartbeatAt).getTime() < 3 * 60 * 1000
      : false;

    const rawProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http');
    const host = req.get('host');
    const isLocal = !host || host.includes('localhost') || host.startsWith('127.0.0.1') || host.startsWith('10.') || host.startsWith('192.168.');
    const protocol = !isLocal ? 'https' : rawProto;
    const dynamicUrl = host ? `${protocol}://${host}` : 'https://127.0.0.1:4000';
    let serverUrl = process.env.PUBLIC_API_URL || dynamicUrl;
    if (!isLocal && serverUrl.startsWith('http://')) {
      serverUrl = serverUrl.replace(/^http:\/\//i, 'https://');
    }

    res.json({
      success: true,
      webhookSecret: config.webhookSecret,
      serverUrl,
      listenerStatus: isOnline ? 'ONLINE' : 'OFFLINE',
      lastHeartbeatAt,
      listenerMetadata,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/listener-heartbeat', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { batteryLevel, phoneModel } = req.body || {};

    await prisma.systemSetting.upsert({
      where: { key: 'last_listener_heartbeat' },
      update: { value: new Date().toISOString() },
      create: { key: 'last_listener_heartbeat', value: new Date().toISOString() },
    });

    if (batteryLevel !== undefined || phoneModel !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: 'listener_metadata' },
        update: { value: JSON.stringify({ batteryLevel, phoneModel, updatedAt: new Date().toISOString() }) },
        create: { key: 'listener_metadata', value: JSON.stringify({ batteryLevel, phoneModel, updatedAt: new Date().toISOString() }) },
      });
    }

    res.json({
      success: true,
      status: 'ok',
      acknowledgedAt: new Date().toISOString(),
      receivedMeta: { batteryLevel, phoneModel },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin Endpoints (Guarded by authenticateAdmin) ───────────────────────────

router.get('/admin/stats', authenticateAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getDashboardStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/solvency-audit', authenticateAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const audit = await adminService.auditPlatformSolvency();
    res.json({ success: true, audit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/upi-settings', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { upiId, upiName } = req.body;
    const result = await adminService.updateUpiSettings(upiId, upiName);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admin/deposits', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const skip = req.query.skip ? parseInt(String(req.query.skip), 10) : 0;
    const deposits = await adminService.getDepositsList(status, limit, skip);
    res.json({ success: true, deposits });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/deposits/:depositId/approve', authenticateAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const depositId = Array.isArray(req.params.depositId) ? req.params.depositId[0] : req.params.depositId;
    const { utr } = req.body;
    if (!utr) {
      res.status(400).json({ error: 'Bank UTR is required' });
      return;
    }
    const result = await adminService.approveDeposit(depositId, utr, req.user!.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/deposits/:depositId/reject', authenticateAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const depositId = Array.isArray(req.params.depositId) ? req.params.depositId[0] : req.params.depositId;
    const { reason } = req.body;
    const result = await adminService.rejectDeposit(depositId, reason || 'Invalid payment', req.user!.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admin/unmatched-payments', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query;
    const items = await adminService.getUnmatchedPayments(status as string);
    res.json({ success: true, unmatchedPayments: items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/unmatched-payments/:id/assign', authenticateAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    const result = await adminService.assignUnmatchedPayment(id, userId, req.user!.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admin/withdrawals', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const skip = req.query.skip ? parseInt(String(req.query.skip), 10) : 0;
    const withdrawals = await adminService.getWithdrawalsList(status, limit, skip);
    res.json({ success: true, withdrawals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/simulate-payment', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { amount, utr } = req.body;
    if (!amount) {
      res.status(400).json({ error: 'Amount is required' });
      return;
    }
    const result = await adminService.simulateIncomingWebhook(Number(amount), utr);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/withdrawals/complete', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { withdrawalId, payoutUtr } = req.body;
    if (!withdrawalId || !payoutUtr) {
      res.status(400).json({ error: 'withdrawalId and payoutUtr are required' });
      return;
    }
    const result = await adminService.completeWithdrawal(withdrawalId, payoutUtr);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/withdrawals/reject', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { withdrawalId, reason } = req.body;
    if (!withdrawalId) {
      res.status(400).json({ error: 'withdrawalId is required' });
      return;
    }
    const result = await adminService.rejectWithdrawal(withdrawalId, reason);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── User Support & Feedback Routes ──────────────────────────────────────────

router.get('/support/contact-info', async (_req: Request, res: Response): Promise<void> => {
  try {
    const contact = await adminService.getSupportContactSettings();
    res.json({ success: true, contact });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/support/feedback', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { category, subject, message, contactInfo } = req.body;
    if (!subject || !message) {
      res.status(400).json({ error: 'Subject and message are required' });
      return;
    }
    const feedback = await adminService.createFeedback(req.user!.id, category, subject, message, contactInfo);
    res.json({ success: true, feedback });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/support/my-feedback', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const feedbacks = await adminService.getUserFeedbacks(req.user!.id);
    res.json({ success: true, feedbacks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin Users & Support Control ──────────────────────────────────────────

router.get('/admin/users', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, status } = req.query;
    const users = await adminService.getUsersList(search as string, status as string);
    res.json({ success: true, users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/users/:userId', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const user = await adminService.getUserProfileDetail(userId);
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.patch('/admin/users/:userId/status', authenticateAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const { status, reason } = req.body;
    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }
    const user = await adminService.updateUserStatus(userId, status, req.user!.id, reason);
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/users/:userId/adjust-balance', authenticateAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const { amount, reason } = req.body;
    if (amount === undefined || isNaN(Number(amount))) {
      res.status(400).json({ error: 'Valid amount is required' });
      return;
    }
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'Reason is required for audit trail' });
      return;
    }
    const result = await adminService.adjustUserBalance(userId, Number(amount), reason.trim(), req.user!.id);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/admin/users/:userId', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const result = await adminService.deleteUser(userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admin/feedback', authenticateAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query;
    const feedbacks = await adminService.getAllFeedback(status as string);
    res.json({ success: true, feedbacks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/admin/feedback/:feedbackId/reply', authenticateAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const feedbackId = Array.isArray(req.params.feedbackId) ? req.params.feedbackId[0] : req.params.feedbackId;
    const { adminReply, status } = req.body;
    if (!adminReply) {
      res.status(400).json({ error: 'adminReply is required' });
      return;
    }
    const feedback = await adminService.replyFeedback(feedbackId, adminReply, status, req.user!.id);
    res.json({ success: true, feedback });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admin/support-settings', authenticateAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const contact = await adminService.getSupportContactSettings();
    res.json({ success: true, contact });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/support-settings', authenticateAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, whatsapp, telegram, hours } = req.body;
    const contact = await adminService.updateSupportSettings({ email, whatsapp, telegram, hours }, req.user!.id);
    res.json({ success: true, contact });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

