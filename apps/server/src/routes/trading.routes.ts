import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateUser, authenticateAdmin, AuthenticatedRequest } from '../middleware/auth.middleware';
import { tradingService } from '../modules/trading/trading.service';
import { TradingError } from '../modules/trading/domain';

const wrap =
  (fn: (req: AuthenticatedRequest, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
    void fn(req as AuthenticatedRequest, res).catch((e: any) =>
      res.status(e instanceof TradingError ? e.status : 500).json({
        error: e instanceof TradingError ? e.message : 'Unable to complete trading request',
        code: e.code || 'INTERNAL_ERROR',
      }),
    );
  };
const id = (req: Request) => String(req.params.id);
export const tradingRouter = Router();
tradingRouter.use(authenticateUser);
tradingRouter.use(
  rateLimit({
    windowMs: 60000,
    limit: 180,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as AuthenticatedRequest).user!.id,
  }),
);
tradingRouter.get(
  '/history',
  wrap(async (req, res) => res.json(await tradingService.tradeHistory(
    req.user!.id, typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
  ))),
);
tradingRouter.get(
  '/markets',
  wrap(async (req, res) =>
    res.json(await tradingService.listForUser(req.user!.id, req.query.view === 'positions')),
  ),
);
tradingRouter.get(
  '/markets/:id',
  wrap(async (req, res) => res.json(await tradingService.snapshot(id(req), req.user!.id))),
);
tradingRouter.get(
  '/markets/:id/candles',
  wrap(async (req, res) =>
    res.json(
      await tradingService.history(
        id(req),
        Number(req.query.outcome ?? 0),
        String(req.query.interval || '1m'),
        req.query.before ? Number(req.query.before) : undefined,
      ),
    ),
  ),
);
tradingRouter.post(
  '/markets/:id/fund',
  wrap(async (req, res) =>
    res.json(await tradingService.fund(id(req), req.user!.id, req.body.amount, req.body.requestId)),
  ),
);
tradingRouter.post(
  '/markets/:id/orders',
  wrap(async (req, res) => res.json(await tradingService.trade(id(req), req.user!.id, req.body))),
);
tradingRouter.get(
  '/markets/:id/orders/:requestId',
  wrap(async (req, res) =>
    res.json(await tradingService.requestResult(id(req), req.user!.id, String(req.params.requestId))),
  ),
);

export const tradingAdminRouter = Router();
tradingAdminRouter.use(authenticateAdmin);
tradingAdminRouter.get(
  '/markets',
  wrap(async (_req, res) => res.json(await tradingService.list())),
);
tradingAdminRouter.post(
  '/simulation',
  wrap(async (_req, res) => res.json({ id: await tradingService.createSimulation() })),
);
tradingAdminRouter.post(
  '/markets/:id/pause',
  wrap(async (req, res) => {
    if (typeof req.body.paused !== 'boolean' || typeof req.body.reason !== 'string')
      throw new TradingError('INVALID_INPUT', 'Pause state and reason required');
    await tradingService.pause(id(req), req.body.paused, req.body.reason.slice(0, 500), req.user!.id);
    res.json({ success: true });
  }),
);
tradingAdminRouter.post(
  '/markets/:id/settle',
  wrap(async (req, res) => {
    if (typeof req.body.reason !== 'string')
      throw new TradingError('INVALID_INPUT', 'Settlement reason required');
    res.json(
      await tradingService.settle(id(req), req.body.winner, req.body.reason.slice(0, 500), req.user!.id),
    );
  }),
);
