import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate } from '../../common/pagination';
import type { ActivityDto, DealDto, NoteDto, PipelineDto, StageDto } from './crm.dto';

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- Pipelines & stages ----------
  async listPipelines() {
    return this.prisma.db.pipeline.findMany({
      orderBy: { createdAt: 'asc' },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
  }

  async getBoard(pipelineId?: string) {
    const pipeline = pipelineId
      ? await this.prisma.findByIdOrFail('pipeline', pipelineId, {
          include: { stages: { orderBy: { position: 'asc' } } },
        })
      : await this.prisma.db.pipeline.findFirst({
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          include: { stages: { orderBy: { position: 'asc' } } },
        });
    if (!pipeline) return { pipeline: null, deals: [] };

    const deals = await this.prisma.db.deal.findMany({
      where: { pipelineId: pipeline.id, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: {
        company: { select: { id: true, name: true } },
        primaryContact: { select: { id: true, fullName: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    return { pipeline, deals };
  }

  createPipeline(dto: PipelineDto) {
    return this.prisma.db.pipeline.create({ data: { ...dto, isDefault: dto.isDefault ?? false } as any });
  }

  async createStage(pipelineId: string, dto: StageDto) {
    await this.prisma.findByIdOrFail('pipeline', pipelineId);
    const last = await this.prisma.db.pipelineStage.findFirst({
      where: { pipelineId },
      orderBy: { position: 'desc' },
    });
    return this.prisma.db.pipelineStage.create({
      data: {
        pipelineId,
        name: dto.name,
        color: dto.color ?? '#71717A',
        probability: dto.probability ?? 10,
        position: dto.position ?? (last ? last.position + 1 : 0),
      },
    });
  }

  async updateStage(id: string, dto: Partial<StageDto>) {
    const stage = await this.prisma.db.pipelineStage.findUnique({ where: { id } });
    if (!stage) throw new BadRequestException('Etapa não encontrada');
    return this.prisma.db.pipelineStage.update({ where: { id }, data: dto as any });
  }

  // ---------- Deals ----------
  async listDeals(query: {
    search?: string;
    status?: string;
    ownerId?: string;
    stageId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { skip, take, page, pageSize } = paginate(query);
    const where = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.stageId ? { stageId: query.stageId } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.deal.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          stage: true,
          pipeline: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
          primaryContact: { select: { id: true, fullName: true } },
          owner: { select: { id: true, name: true } },
        },
      }),
      this.prisma.db.deal.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getDeal(id: string) {
    return this.prisma.findByIdOrFail('deal', id, {
      include: {
        stage: true,
        pipeline: { include: { stages: { orderBy: { position: 'asc' } } } },
        company: true,
        primaryContact: true,
        owner: { select: { id: true, name: true } },
        items: true,
        activities: { orderBy: { occurredAt: 'desc' } },
        stageHistory: { orderBy: { changedAt: 'desc' } },
      },
    });
  }

  async createDeal(dto: DealDto, defaultOwnerId: string) {
    if (!dto.companyId && !dto.primaryContactId) {
      throw new BadRequestException('Informe ao menos um contato ou empresa para o negócio');
    }
    const { pipeline, stage } = await this.resolvePipelineStage(dto.pipelineId, dto.stageId);

    const deal = await this.prisma.db.deal.create({
      data: {
        title: dto.title,
        pipelineId: pipeline.id,
        stageId: stage.id,
        companyId: dto.companyId ?? null,
        primaryContactId: dto.primaryContactId ?? null,
        ownerId: dto.ownerId ?? defaultOwnerId,
        amount: dto.amount ?? 0,
        currency: dto.currency ?? 'BRL',
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null,
        items: dto.items
          ? {
              create: dto.items.map((i) => ({
                description: i.description,
                quantity: i.quantity ?? 1,
                unitPrice: i.unitPrice ?? 0,
                productId: i.productId ?? null,
              })),
            }
          : undefined,
      },
      include: { stage: true, owner: { select: { id: true, name: true } } },
    });

    await this.audit.log({ entityType: 'Deal', entityId: deal.id, action: 'CREATE' });
    return deal;
  }

  async updateDeal(id: string, dto: Partial<DealDto>) {
    const deal = await this.prisma.findByIdOrFail('deal', id);
    const data: any = {};
    for (const key of ['title', 'companyId', 'primaryContactId', 'ownerId', 'amount', 'currency'] as const) {
      if ((dto as any)[key] !== undefined) data[key] = (dto as any)[key];
    }
    if (dto.expectedCloseDate !== undefined) {
      data.expectedCloseDate = dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null;
    }
    if (dto.stageId) {
      data.stageId = dto.stageId;
    }
    const updated = await this.prisma.db.deal.update({ where: { id }, data });
    await this.audit.log({ entityType: 'Deal', entityId: id, action: 'UPDATE', before: { stageId: deal.stageId }, after: dto });
    return updated;
  }

  async moveDeal(id: string, dto: { stageId: string; status?: 'ABERTO' | 'GANHO' | 'PERDIDO'; lossReason?: string; finalAmount?: number }) {
    const deal = await this.prisma.findByIdOrFail('deal', id);
    const stage = await this.prisma.db.pipelineStage.findFirst({ where: { id: dto.stageId, pipelineId: deal.pipelineId } });
    if (!stage) throw new BadRequestException('Etapa inválida para este funil');

    const data: any = { stageId: dto.stageId };
    const status = dto.status ?? deal.status;

    if (status === 'PERDIDO') {
      if (!dto.lossReason) throw new BadRequestException('Informe o motivo da perda');
      data.status = 'PERDIDO';
      data.lossReason = dto.lossReason;
    } else if (status === 'GANHO') {
      data.status = 'GANHO';
      data.wonAt = new Date();
      data.finalAmount = dto.finalAmount ?? deal.amount;
      if (deal.status !== 'GANHO') {
        await this.notifications.notify({
          userId: deal.ownerId,
          type: 'DEAL_MOVED',
          title: 'Negócio ganho',
          body: `${deal.title} foi marcado como ganho.`,
          entityType: 'Deal',
          entityId: deal.id,
          url: `/crm/negocios/${deal.id}`,
        });
      }
    } else {
      data.status = 'ABERTO';
    }

    const updated = await this.prisma.db.deal.update({ where: { id }, data });
    await this.prisma.db.dealStageHistory.create({
      data: {
        dealId: id,
        fromStage: deal.stageId,
        toStage: dto.stageId,
        changedBy: deal.ownerId,
      },
    });
    await this.audit.log({ entityType: 'Deal', entityId: id, action: 'MOVE', before: { stageId: deal.stageId }, after: { stageId: dto.stageId, status: data.status } });
    return updated;
  }

  async removeDeal(id: string) {
    await this.prisma.findByIdOrFail('deal', id);
    await this.prisma.db.deal.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ entityType: 'Deal', entityId: id, action: 'DELETE' });
    return { ok: true };
  }

  // ---------- Activities ----------
  async listActivities(query: { dealId?: string; contactId?: string; pending?: string; from?: string; to?: string }) {
    const where: any = {};
    if (query.dealId) where.dealId = query.dealId;
    if (query.contactId) where.contactId = query.contactId;
    if (query.pending === 'true') where.status = 'PENDING';
    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) where.occurredAt.gte = new Date(query.from);
      if (query.to) where.occurredAt.lte = new Date(query.to);
    }
    return this.prisma.db.activity.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: 100,
      include: {
        deal: { select: { id: true, title: true } },
        contact: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async createActivity(dto: ActivityDto, authorId: string) {
    const activity = await this.prisma.db.activity.create({
      data: {
        type: dto.type,
        subject: dto.subject,
        body: dto.body ?? null,
        dealId: dto.dealId ?? null,
        contactId: dto.contactId ?? null,
        companyId: dto.companyId ?? null,
        createdById: authorId,
        status: (dto.status as any) ?? 'DONE',
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      },
    });
    await this.audit.log({ entityType: 'Activity', entityId: activity.id, action: 'CREATE' });
    return activity;
  }

  async completeActivity(id: string) {
    const activity = await this.prisma.findByIdOrFail('activity', id);
    if (!activity) throw new BadRequestException('Atividade não encontrada');
    return this.prisma.db.activity.update({ where: { id }, data: { status: 'DONE' } });
  }

  async removeActivity(id: string) {
    await this.prisma.findByIdOrFail('activity', id);
    await this.prisma.db.activity.update({ where: { id }, data: { status: 'CANCELLED' } });
    return { ok: true };
  }

  // ---------- Notes ----------
  async listNotes(entityType: string, entityId: string) {
    return this.prisma.db.note.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
  }

  async createNote(dto: NoteDto, authorId: string) {
    const note = await this.prisma.db.note.create({
      data: { entityType: dto.entityType, entityId: dto.entityId, body: dto.body, authorId },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    await this.audit.log({ entityType: 'Note', entityId: note.id, action: 'CREATE' });
    return note;
  }

  // ---------- Timeline ----------
  async timeline(entityType: string, entityId: string) {
    const [activities, notes, history] = await Promise.all([
      this.prisma.db.activity.findMany({
        where: { dealId: entityId },
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.db.note.findMany({
        where: { entityType, entityId },
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      entityType === 'deal'
        ? this.prisma.db.dealStageHistory.findMany({ where: { dealId: entityId }, orderBy: { changedAt: 'desc' } })
        : Promise.resolve([]),
    ]);

    const events = [
      ...activities.map((a: any) => ({ kind: 'activity', at: a.occurredAt, data: a })),
      ...notes.map((n: any) => ({ kind: 'note', at: n.createdAt, data: n })),
      ...history.map((h: any) => ({ kind: 'stage', at: h.changedAt, data: h })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return events;
  }

  private async resolvePipelineStage(pipelineId?: string, stageId?: string) {
    let pipeline = pipelineId
      ? await this.prisma.findByIdOrFail('pipeline', pipelineId, { include: { stages: { orderBy: { position: 'asc' } } } })
      : await this.prisma.db.pipeline.findFirst({
          where: { isDefault: true },
          include: { stages: { orderBy: { position: 'asc' } } },
        });
    if (!pipeline) {
      pipeline = await this.prisma.db.pipeline.findFirst({
        include: { stages: { orderBy: { position: 'asc' } } },
      });
    }
    if (!pipeline) throw new BadRequestException('Nenhum funil configurado. Crie um funil primeiro.');
    const stage = stageId
      ? pipeline.stages.find((s: any) => s.id === stageId)
      : pipeline.stages[0];
    if (!stage) throw new BadRequestException('Funil sem etapas configuradas');
    return { pipeline, stage };
  }
}
