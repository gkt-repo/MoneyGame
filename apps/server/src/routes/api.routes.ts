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

export const router = Router();

// Health check endpoint
router.get('/health', (_req: Request, res: Response): void => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Authentication Endpoints ────────────────────────────────────────────────
// Mount public auth routers
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
router.get('/wallet/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const wallet = await walletService.getWallet(userId);
    res.json({ success: true, wallet });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Payment & Deposits ───────────────────────────────────────────────────────

router.post('/deposits/create', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || req.body.userId;
    const amount = req.body.amount;
    if (!userId || !amount) {
      res.status(400).json({ error: 'userId and amount are required' });
      return;
    }
    const depositData = await paymentService.createDepositRequest(userId, parseFloat(amount));
    res.json({ success: true, ...depositData });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/deposits/claim-utr', authenticateUser, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

router.get('/deposits/status/:depositId', async (req: Request, res: Response): Promise<void> => {
  try {
    const depositId = Array.isArray(req.params.depositId) ? req.params.depositId[0] : req.params.depositId;
    const result = await paymentService.getDepositStatus(depositId);
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

router.post('/withdrawals/request', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || req.body.userId;
    const { amount, upiId } = req.body;
    if (!userId || !amount || !upiId) {
      res.status(400).json({ error: 'userId, amount, and upiId are required' });
      return;
    }
    const result = await walletService.requestWithdrawal(userId, parseFloat(amount), upiId);
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

router.get('/withdrawals/user/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
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

router.post('/rooms/create', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, entryFee, maxPlayers, guessNumber } = req.body;
    if (!userId || !entryFee || !maxPlayers || !guessNumber) {
      res.status(400).json({ error: 'userId, entryFee, maxPlayers, and guessNumber are required' });
      return;
    }
    const room = await gameManager.createRoom(
      userId,
      parseFloat(entryFee),
      parseInt(maxPlayers, 10),
      parseInt(guessNumber, 10)
    );
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/rooms/join', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, roomCode, guessNumber } = req.body;
    if (!userId || !roomCode || !guessNumber) {
      res.status(400).json({ error: 'userId, roomCode, and guessNumber are required' });
      return;
    }
    const room = await gameManager.joinRoom(userId, roomCode, parseInt(guessNumber, 10));
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

// ─── Automated Webhook Receiver (Android Notification / Email Forwarder) ───────

router.post('/webhooks/upi-notify', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers['x-webhook-secret'] || req.headers['authorization'];
    const expectedSecret = config.webhookSecret;

    // Optional token verification if provided
    if (authHeader && authHeader !== expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      res.status(401).json({ error: 'Unauthorized webhook request' });
      return;
    }

    const { amount, utr, senderUpi, senderName } = req.body;
    if (!amount) {
      res.status(400).json({ error: 'Payment amount is required' });
      return;
    }

    const result = await paymentService.verifyIncomingPayment(parseFloat(amount), utr, {
      senderUpi,
      senderName,
      rawPayload: req.body,
    });

    res.json(result);
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
    const result = await adminService.simulateIncomingWebhook(parseFloat(amount), utr);
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
    if (amount === undefined || isNaN(parseFloat(amount))) {
      res.status(400).json({ error: 'Valid amount is required' });
      return;
    }
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'Reason is required for audit trail' });
      return;
    }
    const result = await adminService.adjustUserBalance(userId, parseFloat(amount), reason.trim(), req.user!.id);
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

