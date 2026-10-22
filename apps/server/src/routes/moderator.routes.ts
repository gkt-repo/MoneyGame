import { cashDeskService } from '../modules/moderator/cash-desk.service';
import { Router, Response } from 'express';
import { authenticateAdmin, AuthenticatedRequest } from '../middleware/auth.middleware';
import { moderatorService } from '../modules/moderator/moderator.service';
import { authService } from '../modules/auth/auth.service';
import { prisma } from '../db';
import { walletService } from '../modules/wallet/wallet.service';

export const moderatorRouter = Router();
const handle = (fn: (req: AuthenticatedRequest) => Promise<any>) => async (req: AuthenticatedRequest, res: Response) => {
  try { res.json(await fn(req)); } catch (e: any) { res.status(e.statusCode || (e.code === 'P2025' ? 404 : 400)).json({ error: e.code === 'P2002' ? 'Username, UPI or assignment already exists' : e.message }); }
};
const id = (req: AuthenticatedRequest) => String(req.params.id);
moderatorRouter.get('/moderators', authenticateAdmin, handle(() => moderatorService.list()));
moderatorRouter.post('/moderators', authenticateAdmin, handle(req => moderatorService.create(req.body, req.user!.id)));
moderatorRouter.patch('/moderators/:id', authenticateAdmin, handle(req => moderatorService.update(id(req), req.body, req.user!.id)));
// Archive instead of deleting financial/operator history.
moderatorRouter.delete('/moderators/:id', authenticateAdmin, handle(req => moderatorService.update(id(req), { status: 'BANNED' }, req.user!.id)));
moderatorRouter.get('/upi-pool', authenticateAdmin, handle(() => moderatorService.pool()));
moderatorRouter.post('/upi-pool', authenticateAdmin, handle(req => moderatorService.saveUpi(null, req.body, req.user!.id)));
moderatorRouter.patch('/upi-pool/:id', authenticateAdmin, handle(req => moderatorService.saveUpi(id(req), req.body, req.user!.id)));
moderatorRouter.delete('/upi-pool/:id', authenticateAdmin, handle(req => moderatorService.saveUpi(id(req), { isActive: false, assignedUserId: null }, req.user!.id)));
moderatorRouter.get('/rotation-settings', authenticateAdmin, handle(() => moderatorService.rotation()));
moderatorRouter.patch('/rotation-settings', authenticateAdmin, handle(req => moderatorService.rotation(req.body.batchSize, req.user!.id)));
moderatorRouter.get('/moderator-status', authenticateAdmin, handle(async req => ({
  account: (await moderatorService.pool()).find(a => a.assignedUserId === req.user!.id) || null,
})));
moderatorRouter.post('/logout', authenticateAdmin, handle(async req => {
  await authService.logout(undefined, req.user!.id);
  await prisma.upiAccount.updateMany({ where: { assignedUserId: req.user!.id }, data: { listenerTokenHash: null, listenerConnected: false } });
  return { success: true };
}));
moderatorRouter.post('/withdrawals/claim', authenticateAdmin, handle(req => walletService.claimWithdrawal(req.body.withdrawalId, req.user!.id, req.body.fundingSource)));

moderatorRouter.post('/withdrawals/reassign', authenticateAdmin, handle(req => {
  if (typeof req.body.moderatorId !== 'string' || !req.body.moderatorId) throw new Error('Select a moderator');
  return cashDeskService.reassign(req.body.withdrawalId, req.body.moderatorId, req.user!.id);
}));
moderatorRouter.post('/upi-pool/:id/opening-balance', authenticateAdmin, handle(req =>
  cashDeskService.confirmOpeningBalance(id(req), req.body.balance, req.body.reason, req.user!.id)));

// Reconciliation records an existing bank outcome; it never transfers a processing payout to another payer.
moderatorRouter.post('/withdrawals/reconcile', authenticateAdmin, handle(req => {
  if (req.user!.role !== 'SUPER_ADMIN') throw Object.assign(new Error('Super Admin access required'), { statusCode: 403 });
  const { withdrawalId, outcome, payoutUtr, note } = req.body;
  if (typeof note !== 'string' || note.trim().length < 10) throw new Error('Bank evidence note must contain at least 10 characters');
  if (outcome === 'PAID') return walletService.completeWithdrawal(withdrawalId, payoutUtr, req.user!.id, note);
  if (outcome === 'NOT_PAID') return walletService.rejectWithdrawal(withdrawalId, note, req.user!.id, note);
  throw new Error('Choose PAID or NOT_PAID after verifying the bank record');
}));
