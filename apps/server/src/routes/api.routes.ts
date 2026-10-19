import crypto from 'crypto';
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

// ─── Rate Limiters ───────────────────────────────────────────────────────────

// Strict Limiter for Authentication & OTP routes (prevents brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30, // 30 attempts per 15 minutes per IP
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' },
  skip: () => isTest,
});

// Deposit Creation Rate Limiter
export const depositLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 25,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many deposit requests. Please wait a few minutes before trying again.' },
  skip: () => isTest,
});

// UTR Claim Rate Limiter (prevents UTR brute-forcing)
export const claimLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many UTR claim attempts. Please wait a few minutes before trying again.' },
  skip: () => isTest,
});

// Webhook Rate Limiter
export const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
});

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
// Mount public auth routers with brute-force rate limiting
router.use('/auth', authLimiter, authRouter);
router.use('/v1/auth', authLimiter, authRouter);
router.use('/admin/auth', authLimiter, adminAuthRouter);
router.use('/v1/admin/auth', authLimiter, adminAuthRouter);

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

// ─── Game Rooms ───────────────────────────────────────────────────────────────

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
    const { entryFee, maxPlayers, guessNumber } = req.body;
    if (!userId || !entryFee || !maxPlayers || !guessNumber) {
      res.status(400).json({ error: 'userId, entryFee, maxPlayers, and guessNumber are required' });
      return;
    }
    const room = await gameManager.createRoom(
      userId,
      Number(entryFee),
      Number(maxPlayers),
      Number(guessNumber)
    );
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/rooms/join', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { roomCode, guessNumber } = req.body;
    if (!userId || !roomCode || !guessNumber) {
      res.status(400).json({ error: 'userId, roomCode, and guessNumber are required' });
      return;
    }
    const room = await gameManager.joinRoom(userId, roomCode, Number(guessNumber));
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/rooms/:roomId', async (req: Request, res: Response): Promise<void> => {
  try {
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const room = await gameManager.getRoomDetails(roomId);
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

// ─── Automated Webhook Receiver (Android Notification / Email Forwarder) ───────

router.post('/webhooks/upi-notify', webhookLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers['x-webhook-secret'] || req.headers['authorization'];
    const expectedSecret = config.webhookSecret;

    const supplied = typeof authHeader === 'string' ? authHeader.replace(/^Bearer /, '') : '';
    if (!expectedSecret || !supplied || Buffer.byteLength(supplied) !== Buffer.byteLength(expectedSecret)
        || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expectedSecret))) {
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
    const expectedSecret = config.webhookSecret;

    const supplied = typeof authHeader === 'string' ? authHeader.replace(/^Bearer /, '') : '';
    if (!expectedSecret || !supplied || Buffer.byteLength(supplied) !== Buffer.byteLength(expectedSecret)
        || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expectedSecret))) {
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

router.get('/admin/deposits', authenticateAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const deposits = await adminService.getDepositsList();
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

router.get('/admin/withdrawals', authenticateAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const withdrawals = await adminService.getWithdrawalsList();
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

