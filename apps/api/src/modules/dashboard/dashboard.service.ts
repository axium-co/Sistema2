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

  /**
   * Relatório avançado do período: resumo (ganhos/perdidos/abertos, conversão,
   * ciclo médio), desempenho por membro, série mensal, funil aberto e atividades
   * por tipo. Janela em dias (7..365, padrão 90).
   */
  async reports(daysParam?: string) {
    const days = Math.min(365, Math.max(7, Number(daysParam) || 90));
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const dealSelect = {
      id: true,
      ownerId: true,
      stageId: true,
      amount: true,
      finalAmount: true,
      createdAt: true,
      wonAt: true,
      updatedAt: true,
    } as const;

    const [won, lost, open, created, users, activities, stages, newLeads] = (await Promise.all([
      this.prisma.db.deal.findMany({
        where: { deletedAt: null, status: 'GANHO', wonAt: { gte: from, lte: to } },
        select: dealSelect,
      }),
      this.prisma.db.deal.findMany({
        where: { deletedAt: null, status: 'PERDIDO', updatedAt: { gte: from, lte: to } },
        select: dealSelect,
      }),
      this.prisma.db.deal.findMany({ where: { deletedAt: null, status: 'ABERTO' }, select: dealSelect }),
      this.prisma.db.deal.findMany({
        where: { deletedAt: null, createdAt: { gte: from, lte: to } },
        select: { createdAt: true, amount: true },
      }),
      this.prisma.db.user.findMany({ select: { id: true, name: true } }),
      this.prisma.db.activity.findMany({
        where: { occurredAt: { gte: from, lte: to } },
        select: { type: true },
      }),
      this.prisma.db.pipelineStage.findMany({
        orderBy: { position: 'asc' },
        select: { id: true, name: true, color: true },
      }),
      this.prisma.db.lead.count({ where: { deletedAt: null, createdAt: { gte: from, lte: to } } }),
    ])) as [any[], any[], any[], any[], any[], any[], any[], number];

    const amountOf = (d: any) => Number(d.finalAmount ?? d.amount ?? 0);
    const nameByUser = new Map(users.map((u) => [u.id, u.name]));

    const wonValue = won.reduce((sum, d) => sum + amountOf(d), 0);
    const lostValue = lost.reduce((sum, d) => sum + amountOf(d), 0);
    const openValue = open.reduce((sum, d) => sum + amountOf(d), 0);
    const cycleDays =
      won.length > 0
        ? won.reduce((sum, d) => sum + (new Date(d.wonAt ?? d.createdAt).getTime() - new Date(d.createdAt).getTime()), 0) /
          won.length /
          (24 * 60 * 60 * 1000)
        : 0;
    const closedCount = won.length + lost.length;

    const byMemberMap = new Map<
      string,
      { userId: string; name: string; openCount: number; openValue: number; wonCount: number; wonValue: number; lostCount: number }
    >();
    const memberOf = (userId: string) => {
      let entry = byMemberMap.get(userId);
      if (!entry) {
        entry = { userId, name: nameByUser.get(userId) ?? '—', openCount: 0, openValue: 0, wonCount: 0, wonValue: 0, lostCount: 0 };
        byMemberMap.set(userId, entry);
      }
      return entry;
    };
    for (const d of open) {
      const entry = memberOf(d.ownerId);
      entry.openCount += 1;
      entry.openValue += amountOf(d);
    }
    for (const d of won) {
      const entry = memberOf(d.ownerId);
      entry.wonCount += 1;
      entry.wonValue += amountOf(d);
    }
    for (const d of lost) memberOf(d.ownerId).lostCount += 1;

    const monthCount = Math.min(12, Math.max(1, Math.ceil(days / 30)));
    const monthly: { month: string; createdCount: number; createdValue: number; wonCount: number; wonValue: number }[] = [];
    const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - i, 1));
      monthly.push({ month: monthKey(d), createdCount: 0, createdValue: 0, wonCount: 0, wonValue: 0 });
    }
    const monthIndex = new Map(monthly.map((m, i) => [m.month, i]));
    for (const d of created) {
      const index = monthIndex.get(monthKey(new Date(d.createdAt)));
      if (index === undefined) continue;
      monthly[index].createdCount += 1;
      monthly[index].createdValue += Number(d.amount ?? 0);
    }
    for (const d of won) {
      const index = monthIndex.get(monthKey(new Date(d.wonAt ?? d.createdAt)));
      if (index === undefined) continue;
      monthly[index].wonCount += 1;
      monthly[index].wonValue += amountOf(d);
    }

    const byActivityType = new Map<string, number>();
    for (const a of activities) byActivityType.set(a.type, (byActivityType.get(a.type) ?? 0) + 1);

    const openByStage = new Map<string, number>();
    for (const d of open) openByStage.set(d.stageId, (openByStage.get(d.stageId) ?? 0) + 1);
    const openValueByStage = new Map<string, number>();
    for (const d of open) openValueByStage.set(d.stageId, (openValueByStage.get(d.stageId) ?? 0) + amountOf(d));

    return {
      period: { days, from, to },
      summary: {
        wonCount: won.length,
        wonValue,
        lostCount: lost.length,
        lostValue,
        openCount: open.length,
        openValue,
        createdCount: created.length,
        createdValue: created.reduce((sum, d) => sum + Number(d.amount ?? 0), 0),
        conversionRate: closedCount > 0 ? won.length / closedCount : 0,
        avgCycleDays: Math.round(cycleDays),
        newLeads,
        activitiesCount: activities.length,
      },
      byMember: [...byMemberMap.values()].sort((a, b) => b.wonValue - a.wonValue),
      monthly,
      byStage: stages.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        count: openByStage.get(s.id) ?? 0,
        value: openValueByStage.get(s.id) ?? 0,
      })),
      byActivityType: [...byActivityType.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    };
  }
}
