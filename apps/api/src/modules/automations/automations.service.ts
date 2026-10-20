import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export const AUTOMATION_TRIGGERS = ['DEAL_CREATED', 'DEAL_STAGE_CHANGED', 'DEAL_WON', 'DEAL_LOST'] as const;
export const AUTOMATION_ACTIONS = ['NOTIFY_OWNER', 'NOTIFY_USER', 'CREATE_ACTIVITY', 'CREATE_TASK'] as const;

export type AutomationTriggerName = (typeof AUTOMATION_TRIGGERS)[number];
export type AutomationActionName = (typeof AUTOMATION_ACTIONS)[number];

export interface AutomationDeal {
  id: string;
  title: string;
  ownerId: string;
  stageId: string;
  pipelineId: string;
  amount: unknown;
  finalAmount?: unknown;
}

interface RunContext {
  fromStageId?: string;
  toStageId?: string;
}

/**
 * Automações de CRM: regras "gatilho → condições → ação" avaliadas quando um
 * negócio é criado, muda de etapa ou é ganho/perdido. A execução é best-effort:
 * falhas em uma regra nunca interrompem a operação original.
 */
@Injectable()
export class AutomationsService {
  private readonly logger = new Logger('Automations');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  list() {
    return this.prisma.db.automationRule.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(
    dto: {
      name: string;
      trigger: string;
      conditions?: Record<string, unknown>;
      action: string;
      actionConfig?: Record<string, unknown>;
      enabled?: boolean;
    },
    userId: string,
  ) {
    this.assertValid(dto.trigger, dto.action);
    return this.prisma.db.automationRule.create({
      data: {
        name: dto.name,
        trigger: dto.trigger as AutomationTriggerName,
        conditions: (dto.conditions ?? {}) as any,
        action: dto.action as AutomationActionName,
        actionConfig: (dto.actionConfig ?? {}) as any,
        enabled: dto.enabled ?? true,
        createdById: userId,
      },
    });
  }

  async update(
    id: string,
    dto: Partial<{
      name: string;
      trigger: string;
      conditions: Record<string, unknown>;
      action: string;
      actionConfig: Record<string, unknown>;
      enabled: boolean;
    }>,
  ) {
    await this.prisma.findByIdOrFail('automationRule', id);
    if (dto.trigger !== undefined || dto.action !== undefined) {
      this.assertValid(dto.trigger ?? 'DEAL_CREATED', dto.action ?? 'NOTIFY_OWNER', true);
    }
    const data: any = { ...dto };
    return this.prisma.db.automationRule.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.prisma.findByIdOrFail('automationRule', id);
    await this.prisma.db.automationRule.delete({ where: { id } });
    return { ok: true };
  }

  async toggle(id: string) {
    const rule = await this.prisma.findByIdOrFail('automationRule', id);
    return this.prisma.db.automationRule.update({ where: { id }, data: { enabled: !rule.enabled } });
  }

  private assertValid(trigger: string, action: string, partial = false) {
    if (!AUTOMATION_TRIGGERS.includes(trigger as AutomationTriggerName)) {
      throw new BadRequestException('Gatilho de automação inválido');
    }
    if (!AUTOMATION_ACTIONS.includes(action as AutomationActionName)) {
      throw new BadRequestException('Ação de automação inválida');
    }
    void partial;
  }

  /** Avalia e executa as regras habilitadas para o gatilho informado. */
  async run(trigger: AutomationTriggerName, deal: AutomationDeal, context: RunContext = {}) {
    try {
      const rules = await this.prisma.db.automationRule.findMany({ where: { trigger, enabled: true } });
      for (const rule of rules) {
        try {
          if (!this.matches(rule, deal, context)) continue;
          await this.execute(rule, deal);
          await this.prisma.db.automationRule.update({
            where: { id: rule.id },
            data: { runCount: { increment: 1 }, lastRunAt: new Date() },
          });
        } catch (err) {
          this.logger.warn(`Falha ao executar a automação "${rule.name}": ${err}`);
        }
      }
    } catch (err) {
      this.logger.warn(`Falha ao avaliar automações (${trigger}): ${err}`);
    }
  }

  private matches(rule: any, deal: AutomationDeal, context: RunContext) {
    const conditions = (rule.conditions ?? {}) as Record<string, any>;
    if (conditions.pipelineId && conditions.pipelineId !== deal.pipelineId) return false;
    if (conditions.stageId) {
      const stageId = rule.trigger === 'DEAL_STAGE_CHANGED' ? context.toStageId ?? deal.stageId : deal.stageId;
      if (conditions.stageId !== stageId) return false;
    }
    if (conditions.minAmount !== undefined) {
      const amount = Number(deal.finalAmount ?? deal.amount ?? 0);
      if (amount < Number(conditions.minAmount)) return false;
    }
    return true;
  }

  private async execute(rule: any, deal: AutomationDeal) {
    const config = (rule.actionConfig ?? {}) as Record<string, any>;
    const url = `/crm/negocios/${deal.id}`;
    const render = (template: string) =>
      template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String((deal as any)[key] ?? ''));

    if (rule.action === 'NOTIFY_OWNER' || rule.action === 'NOTIFY_USER') {
      const userId = rule.action === 'NOTIFY_USER' ? config.userId : deal.ownerId;
      if (!userId) throw new BadRequestException('Automação sem destinatário configurado');
      await this.notifications.notify({
        userId,
        type: 'AUTOMATION',
        title: render(config.title ?? rule.name),
        body: render(config.body ?? `Negócio "${deal.title}" acionou a automação ${rule.name}.`),
        entityType: 'Deal',
        entityId: deal.id,
        url,
      });
      return;
    }

    if (rule.action === 'CREATE_ACTIVITY') {
      await this.prisma.db.activity.create({
        data: {
          type: config.type ?? 'NOTE',
          subject: render(config.subject ?? `Automação: ${rule.name}`),
          body: config.body ? render(String(config.body)) : null,
          dealId: deal.id,
          createdById: config.userId ?? deal.ownerId,
          status: 'PENDING',
          dueAt: config.dueInDays ? new Date(Date.now() + Number(config.dueInDays) * 24 * 60 * 60 * 1000) : null,
        },
      });
      return;
    }

    if (rule.action === 'CREATE_TASK') {
      const board = config.boardId
        ? await this.prisma.db.board.findFirst({
            where: { id: config.boardId },
            include: { lists: { orderBy: { position: 'asc' } } },
          })
        : await this.prisma.db.board.findFirst({
            orderBy: { createdAt: 'asc' },
            include: { lists: { orderBy: { position: 'asc' } } },
          });
      const list = board?.lists?.[0] as any;
      if (!board || !list) throw new BadRequestException('Nenhum quadro/lista disponível para criar a tarefa');
      const last = await this.prisma.db.card.findFirst({
        where: { listId: list.id },
        orderBy: { position: 'desc' },
      });
      const card = await this.prisma.db.card.create({
        data: {
          boardId: board.id,
          listId: list.id,
          createdById: config.userId ?? deal.ownerId,
          title: render(config.title ?? `Follow-up: ${deal.title}`),
          description: config.description ? render(String(config.description)) : '',
          position: (last?.position ?? 0) + 1,
          priority: config.priority ?? 'MEDIUM',
          dueDate: config.dueInDays ? new Date(Date.now() + Number(config.dueInDays) * 24 * 60 * 60 * 1000) : null,
          dealId: deal.id,
        },
      });
      const assigneeId = config.assigneeId ?? deal.ownerId;
      if (assigneeId) {
        await this.prisma.db.cardAssignee.create({ data: { cardId: card.id, userId: assigneeId } }).catch(() => undefined);
      }
    }
  }
}
