import { Server } from 'socket.io';
import { prisma } from '../../db';

export type NotificationType =
  | 'WITHDRAWAL_COMPLETED'
  | 'WITHDRAWAL_REJECTED'
  | 'DEPOSIT_APPROVED'
  | 'ROOM_WIN'
  | 'FEEDBACK_REPLY'
  | 'SYSTEM';

export interface CreateNotificationInput {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  metadata?: Record<string, any>;
}

export class NotificationService {
  private io?: Server;

  setSocketServer(io: Server) {
    this.io = io;
  }

  async create(params: CreateNotificationInput) {
    const notification = await prisma.notification.create({
      data: {
        userId: params.userId,
        title: params.title,
        message: params.message,
        type: params.type,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });

    const parsedNotification = {
      ...notification,
      metadata: params.metadata || null,
    };

    if (this.io) {
      this.io.to(`user:${params.userId}`).emit('new_notification', parsedNotification);
      const unreadCount = await this.getUnreadCount(params.userId);
      this.io.to(`user:${params.userId}`).emit('notification_unread_count', { unreadCount });
    }

    return parsedNotification;
  }

  async getUserNotifications(userId: string, limit = 50) {
    const items = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return items.map((n) => ({
      ...n,
      metadata: n.metadata ? safeJsonParse(n.metadata) : null,
    }));
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });

    const unreadCount = await this.getUnreadCount(userId);
    if (this.io) {
      this.io.to(`user:${userId}`).emit('notification_unread_count', { unreadCount });
    }
    return { success: true, unreadCount };
  }

  async markAllAsRead(userId: string) {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    if (this.io) {
      this.io.to(`user:${userId}`).emit('notification_unread_count', { unreadCount: 0 });
    }
    return { success: true, unreadCount: 0 };
  }

  async deleteNotification(notificationId: string, userId: string) {
    await prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });

    const unreadCount = await this.getUnreadCount(userId);
    if (this.io) {
      this.io.to(`user:${userId}`).emit('notification_unread_count', { unreadCount });
    }
    return { success: true, unreadCount };
  }

  async clearAll(userId: string) {
    await prisma.notification.deleteMany({
      where: { userId },
    });

    if (this.io) {
      this.io.to(`user:${userId}`).emit('notification_unread_count', { unreadCount: 0 });
    }
    return { success: true, unreadCount: 0 };
  }
}

function safeJsonParse(str: string) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export const notificationService = new NotificationService();
