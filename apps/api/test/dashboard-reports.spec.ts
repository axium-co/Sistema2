import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/common/tenant-context';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';

/**
 * Relatórios avançados: resumo do período, série mensal, funil por etapa,
 * desempenho por membro e atividades por tipo.
 */
describe('Relatórios do dashboard', () => {
  const prisma = new PrismaService();
  const dashboard = new DashboardService(prisma);

  let tenantId: string;
  let userA: string;
  let userB: string;
  let pipelineId: string;
  let stage1: string;
  let stage2: string;

  const run = <T>(fn: () => Promise<T> | T) => TenantContext.run({ tenantId, userId: userA }, fn);
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = Date.now();
    const tenant = await prisma.tenant.create({ data: { name: 'Reports', slug: `reports-${suffix}` } });
    tenantId = tenant.id;
    const a = await prisma.user.create({ data: { tenantId, email: `rep-a-${suffix}@test.dev`, passwordHash: 'x', name: 'Ana' } });
    const b = await prisma.user.create({ data: { tenantId, email: `rep-b-${suffix}@test.dev`, passwordHash: 'x', name: 'Bruno' } });
    userA = a.id;
    userB = b.id;

    const pipeline = await prisma.pipeline.create({ data: { tenantId, name: 'Comercial', isDefault: true } });
    pipelineId = pipeline.id;
    const s1 = await prisma.pipelineStage.create({ data: { pipelineId, name: 'Prospecção', position: 1, color: '#7C9CBF' } });
    const s2 = await prisma.pipelineStage.create({ data: { pipelineId, name: 'Proposta', position: 2, color: '#BFA27C' } });
    stage1 = s1.id;
    stage2 = s2.id;

    await prisma.deal.createMany({
      data: [
        { tenantId, pipelineId, stageId: stage1, ownerId: userA, title: 'Ganho A', amount: 1000, status: 'GANHO', finalAmount: 900, wonAt: daysAgo(5), createdAt: daysAgo(40) },
        { tenantId, pipelineId, stageId: stage1, ownerId: userA, title: 'Perdido A', amount: 500, status: 'PERDIDO', updatedAt: daysAgo(2), createdAt: daysAgo(20) },
        { tenantId, pipelineId, stageId: stage1, ownerId: userB, title: 'Aberto B1', amount: 300, status: 'ABERTO', createdAt: daysAgo(10) },
        { tenantId, pipelineId, stageId: stage2, ownerId: userB, title: 'Aberto B2', amount: 200, status: 'ABERTO', createdAt: daysAgo(60) },
      ],
    });

    await prisma.activity.createMany({
      data: [
        { tenantId, type: 'MEETING', subject: 'Reunião', createdById: userA, occurredAt: daysAgo(3) },
        { tenantId, type: 'MEETING', subject: 'Reunião 2', createdById: userA, occurredAt: daysAgo(4) },
        { tenantId, type: 'CALL', subject: 'Ligação', createdById: userB, occurredAt: daysAgo(6) },
      ],
    });
  });

  afterAll(async () => {
    await TenantContext.run({ allowUnscoped: true }, async () => {
      await prisma.activity.deleteMany({ where: { tenantId } });
      await prisma.deal.deleteMany({ where: { tenantId } });
      await prisma.pipelineStage.deleteMany({ where: { pipelineId } });
      await prisma.pipeline.deleteMany({ where: { id: pipelineId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  it('consolida o resumo do período', async () => {
    const report = await run(() => dashboard.reports('90'));
    expect(report.period.days).toBe(90);
    expect(report.summary.wonCount).toBe(1);
    expect(report.summary.wonValue).toBe(900);
    expect(report.summary.lostCount).toBe(1);
    expect(report.summary.openCount).toBe(2);
    expect(report.summary.openValue).toBe(500);
    expect(report.summary.conversionRate).toBeCloseTo(0.5, 5);
    expect(report.summary.avgCycleDays).toBe(35);
    expect(report.summary.activitiesCount).toBe(3);
    expect(report.summary.newLeads).toBe(0);
  });

  it('gera a série mensal cobrindo o período', async () => {
    const report = await run(() => dashboard.reports('90'));
    expect(report.monthly).toHaveLength(3);
    const totals = report.monthly.reduce(
      (acc: any, m: any) => ({
        createdValue: acc.createdValue + m.createdValue,
        wonValue: acc.wonValue + m.wonValue,
      }),
      { createdValue: 0, wonValue: 0 },
    );
    expect(totals.wonValue).toBe(900);
    expect(totals.createdValue).toBeGreaterThanOrEqual(1500);
  });

  it('agrupa funil aberto por etapa e desempenho por membro', async () => {
    const report = await run(() => dashboard.reports('90'));
    const prospeccao = report.byStage.find((s) => s.id === stage1);
    const proposta = report.byStage.find((s) => s.id === stage2);
    expect(prospeccao).toMatchObject({ count: 1, value: 300 });
    expect(proposta).toMatchObject({ count: 1, value: 200 });

    const ana = report.byMember.find((m) => m.userId === userA)!;
    const bruno = report.byMember.find((m) => m.userId === userB)!;
    expect(ana).toMatchObject({ wonCount: 1, wonValue: 900, lostCount: 1, openCount: 0 });
    expect(bruno).toMatchObject({ wonCount: 0, openCount: 2, openValue: 500 });

    const meeting = report.byActivityType.find((a) => a.type === 'MEETING');
    expect(meeting?.count).toBe(2);
  });

  it('restringe a janela mínima a 7 dias', async () => {
    const report = await run(() => dashboard.reports('1'));
    expect(report.period.days).toBe(7);
  });
});
