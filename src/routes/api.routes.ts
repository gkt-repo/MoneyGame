import { Router, Request, Response } from 'express';
import { walletService } from '../modules/wallet/wallet.service';
import { paymentService } from '../modules/payment/payment.service';
import { gameManager } from '../modules/game/game.manager';
import { adminService } from '../modules/admin/admin.service';
import { config } from '../config';

export const router = Router();

// ─── User & Wallet ────────────────────────────────────────────────────────────

router.post('/users/login-or-register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      res.status(400).json({ error: 'Valid username is required' });
      return;
    }
    const cleanUsername = username.trim().toLowerCase();
    const user = await walletService.getOrCreateUser(cleanUsername);
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
    const { userId, amount } = req.body;
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

router.get('/deposits/status/:depositId', async (req: Request, res: Response): Promise<void> => {
  try {
    const depositId = Array.isArray(req.params.depositId) ? req.params.depositId[0] : req.params.depositId;
    const result = await paymentService.getDepositStatus(depositId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// ─── Withdrawals ──────────────────────────────────────────────────────────────

router.post('/withdrawals/request', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, amount, upiId } = req.body;
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

    const { amount, utr } = req.body;
    if (!amount) {
      res.status(400).json({ error: 'Payment amount is required' });
      return;
    }

    const result = await paymentService.verifyIncomingPayment(parseFloat(amount), utr);

    if (!result.success) {
      res.status(404).json(result);
      return;
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin Endpoints ──────────────────────────────────────────────────────────

router.get('/admin/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getDashboardStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/upi-settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const { upiId, upiName } = req.body;
    const result = await adminService.updateUpiSettings(upiId, upiName);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admin/deposits', async (_req: Request, res: Response): Promise<void> => {
  try {
    const deposits = await adminService.getDepositsList();
    res.json({ success: true, deposits });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/withdrawals', async (_req: Request, res: Response): Promise<void> => {
  try {
    const withdrawals = await adminService.getWithdrawalsList();
    res.json({ success: true, withdrawals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/simulate-payment', async (req: Request, res: Response): Promise<void> => {
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

router.post('/admin/withdrawals/complete', async (req: Request, res: Response): Promise<void> => {
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

router.post('/admin/withdrawals/reject', async (req: Request, res: Response): Promise<void> => {
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
