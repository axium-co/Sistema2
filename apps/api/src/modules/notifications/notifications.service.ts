import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../common/event-bus.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventBusService,
  ) {}

  async notify(params: {
    userId: string;
    type: string;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
    url?: string;
  }) {
    const notification = await this.prisma.db.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        url: params.url ?? null,
      },
    });
    this.bus.publish(EventBusService.channelForUser(params.userId), {
      type: 'notification',
      notification,
    });
    return notification;
  }

  async list(userId: string, onlyUnread = false) {
    return this.prisma.db.notification.findMany({
      where: { userId, ...(onlyUnread ? { read: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(userId: string) {
    return this.prisma.db.notification.count({ where: { userId, read: false } });
  }

  async markRead(id: string, userId: string) {
    await this.prisma.db.notification.updateMany({ where: { id, userId }, data: { read: true } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.db.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return { ok: true };
  }
}
