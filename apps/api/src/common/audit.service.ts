import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from './tenant-context';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    entityType: string;
    entityId?: string;
    action: string;
    before?: unknown;
    after?: unknown;
    actorId?: string;
  }) {
    const actorId = params.actorId ?? TenantContext.userId;
    try {
      await this.prisma.db.auditLog.create({
        data: {
          entityType: params.entityType,
          entityId: params.entityId,
          action: params.action,
          before: (params.before ?? undefined) as any,
          after: (params.after ?? undefined) as any,
          actorId: actorId ?? null,
        },
      });
    } catch {
      /* auditoria nunca deve interromper a operação principal */
    }
  }
}
