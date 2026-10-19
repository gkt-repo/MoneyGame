import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from './db';
import { config } from './config';
import { TokenPayload } from './modules/auth/auth.types';

export function configureSockets(io: Server) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('Authentication required');
      const decoded = jwt.verify(token, config.jwtSecret, {
        algorithms: ['HS256'], audience: [config.userAudience, config.adminAudience],
      }) as TokenPayload & jwt.JwtPayload;
      const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, role: true, status: true } });
      if (!user || user.status !== 'ACTIVE') throw new Error('Account unavailable');
      const admin = decoded.aud === config.adminAudience && ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
      socket.data.userId = user.id;
      socket.data.admin = admin;
      socket.data.expiresAt = (decoded.exp || 0) * 1000;
      next();
    } catch {
      const error = new Error('Socket authentication required');
      (error as any).data = { code: 'AUTH_REQUIRED' };
      next(error);
    }
  });
  io.on('connection', socket => {
    socket.join(`user:${socket.data.userId}`);
    if (socket.data.admin) socket.join('admin_channel');
    // Disconnect expired sessions so clients must refresh and authenticate again.
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(1, socket.data.expiresAt - Date.now()));
    socket.on('disconnect', () => clearTimeout(expiry));
    socket.on('join_user_channel', () => socket.join(`user:${socket.data.userId}`));
    socket.on('join_admin_channel', () => { if (socket.data.admin) socket.join('admin_channel'); });
    socket.on('join_deposit_channel', async (id: unknown) => {
      if (typeof id !== 'string') return;
      try {
        const deposit = await prisma.deposit.findFirst({ where: { id, userId: socket.data.userId }, select: { id: true } });
        if (socket.connected && deposit) await socket.join(`deposit:${id}`);
      } catch { socket.emit('subscription_error', { message: 'Unable to subscribe to deposit' }); }
    });
    socket.on('leave_deposit_channel', (id: unknown) => { if (typeof id === 'string') socket.leave(`deposit:${id}`); });
    socket.on('join_room_channel', (id: unknown) => { if (typeof id === 'string') socket.join(`room:${id}`); });
    socket.on('leave_room_channel', (id: unknown) => { if (typeof id === 'string') socket.leave(`room:${id}`); });
  });
}
