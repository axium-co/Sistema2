import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async myDay(userId: string) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      eventsToday,
      tasksToday,
      overdueActivities,
      newLeads,
      openDeals,
      wonThisMonth,
      goal,
    ] = await Promise.all([
      this.prisma.db.event.findMany({
        where: { deletedAt: null, startsAt: { gte: startOfDay, lte: endOfDay } },
        orderBy: { startsAt: 'asc' },
        include: { deal: { select: { id: true, title: true } } },
      }),
      this.prisma.db.card.findMany({
        where: { archivedAt: null, completedAt: null, dueDate: { gte: startOfDay, lte: endOfDay } },
        orderBy: { dueDate: 'asc' },
        include: { board: { select: { id: true, name: true } } },
      }),
      this.prisma.db.activity.findMany({
        where: { status: 'PENDING', dueAt: { lt: now } },
        orderBy: { dueAt: 'asc' },
        take: 20,
        include: { deal: { select: { id: true, title: true } }, contact: { select: { id: true, fullName: true } } },
      }),
      this.prisma.db.lead.count({ where: { deletedAt: null, status: 'NOVO' } }),
      this.prisma.db.deal.count({ where: { deletedAt: null, status: 'ABERTO' } }),
      this.prisma.db.deal.aggregate({
        where: { deletedAt: null, status: 'GANHO', wonAt: { gte: startOfMonth } },
        _sum: { finalAmount: true, amount: true },
      }),
      this.prisma.db.goal.findFirst({
        where: { ownerId: userId, periodStart: { lte: now }, periodEnd: { gte: now } },
        orderBy: { periodStart: 'desc' },
      }),
    ]);

    const openDealsValue = await this.prisma.db.deal.aggregate({
      where: { deletedAt: null, status: 'ABERTO' },
      _sum: { amount: true },
    });

    const cardsOverdue = await this.prisma.db.card.findMany({
      where: { archivedAt: null, completedAt: null, dueDate: { lt: now } },
      orderBy: { dueDate: 'asc' },
      take: 20,
      include: { board: { select: { id: true, name: true } } },
    });

    const won = Number(wonThisMonth._sum.finalAmount ?? wonThisMonth._sum.amount ?? 0);

    return {
      summary: {
        eventsToday: eventsToday.length,
        tasksToday: tasksToday.length,
        overdueActivities: overdueActivities.length,
        overdueCards: cardsOverdue.length,
        newLeads,
        openDeals,
        openDealsValue: Number(openDealsValue._sum.amount ?? 0),
        wonThisMonth: won,
        goal: goal ? { target: Number(goal.target), metric: goal.metric, progress: won } : null,
      },
      timeline: [
        ...eventsToday.map((e: any) => ({
          kind: 'event' as const,
          id: e.id,
          title: e.title,
          at: e.startsAt,
          endAt: e.endsAt,
          type: e.type,
          color: e.color,
          dealId: e.dealId,
        })),
        ...tasksToday.map((c: any) => ({
          kind: 'task' as const,
          id: c.id,
          title: c.title,
          at: c.dueDate,
          priority: c.priority,
          boardId: c.boardId,
          boardName: c.board.name,
        })),
      ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
      overdue: {
        activities: overdueActivities,
        cards: cardsOverdue,
      },
    };
  }

  async pipelineFunnel() {
    const pipelines = await this.prisma.db.pipeline.findMany({
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    const result = [];
    for (const pipeline of pipelines) {
      const stages = [];
      for (const stage of pipeline.stages) {
        const agg = await this.prisma.db.deal.aggregate({
          where: { pipelineId: pipeline.id, stageId: stage.id, deletedAt: null, status: 'ABERTO' },
          _sum: { amount: true },
          _count: true,
        });
        stages.push({
          id: stage.id,
          name: stage.name,
          color: stage.color,
          count: (agg as any)._count,
          value: Number(agg._sum.amount ?? 0),
        });
      }
      result.push({ id: pipeline.id, name: pipeline.name, stages });
    }
    return result;
  }

  async leadsBySource() {
    const rows = await this.prisma.db.lead.groupBy({
      by: ['source'],
      where: { deletedAt: null },
      _count: true,
    });
    return rows.map((r: any) => ({ source: r.source ?? 'Não informado', count: r._count }));
  }
}
