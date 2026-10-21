import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { config } from '../config';
import { TokenPayload } from '../modules/auth/auth.types';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    phone: string | null;
    email: string | null;
    role: string;
    status: string;
  };
}

/**
 * Middleware to authenticate User requests (Mobile App & User Web)
 */
export async function authenticateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. No token provided.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { audience: config.userAudience, algorithms: ['HS256'] }) as TokenPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        tokenVersion: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found or deleted' });
      return;
    }

    const tokenVersion = typeof decoded.tokenVersion === 'number' ? decoded.tokenVersion : 0;
    if (tokenVersion !== user.tokenVersion) {
      res.status(401).json({ error: 'Session invalidated. Please log in again.', code: 'SESSION_REVOKED' });
      return;
    }

    if (user.status !== 'ACTIVE') {
      res.status(403).json({ error: `Account is ${user.status.toLowerCase()}` });
      return;
    }

    req.user = user;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ error: 'Invalid authentication token' });
  }
}

/**
 * Middleware to authenticate Admin requests (Admin App & Admin Web)
 */
export async function authenticateAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      audience: config.adminAudience,
      algorithms: ['HS256'],
    }) as TokenPayload;

    if (!['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(decoded.role)) {
      res.status(403).json({ error: 'Access denied: Admin privileges required.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        tokenVersion: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Admin account not found' });
      return;
    }

    const tokenVersion = typeof decoded.tokenVersion === 'number' ? decoded.tokenVersion : 0;
    if (tokenVersion !== user.tokenVersion) {
      res.status(401).json({ error: 'Admin session invalidated. Please log in again.', code: 'SESSION_REVOKED' });
      return;
    }

    if (!['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      res.status(403).json({ error: 'Access denied: Insufficient privileges.' });
      return;
    }

    if (user.status !== 'ACTIVE') {
      res.status(403).json({ error: `Admin account is ${user.status.toLowerCase()}` });
      return;
    }

    req.user = user;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Admin session expired', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ error: 'Invalid admin credentials or token' });
  }
}

/**
 * Role-Based Access Control (RBAC) guard
 */
export function requireRoles(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Access forbidden: Role not permitted' });
      return;
    }
    next();
  };
}
