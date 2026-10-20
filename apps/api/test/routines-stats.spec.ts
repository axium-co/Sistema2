import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/common/tenant-context';
import { RoutinesService } from '../src/modules/routines/routines.service';

/** Estatísticas/streak das rotinas: taxa de adesão, série diária e sequências. */
describe('RoutinesService.routineStats', () => {
  const prisma = new PrismaService();
  const service = new RoutinesService(prisma, { log: async () => {} } as any);

  let tenantId: string;
  let userId: string;
  const run = <T>(fn: () => Promise<T> | T) => TenantContext.run({ tenantId, userId }, async () => fn());

  const dayOffset = (offset: number) => {
    const now = new Date();
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return new Date(base.getTime() - offset * 86400000);
  };

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = Date.now();
    const tenant = await prisma.tenant.create({ data: { name: 'Rotina', slug: `rotina-${suffix}` } });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: { tenantId, email: `rotina-${suffix}@test.dev`, passwordHash: 'x', name: 'Dono', role: 'OWNER' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await TenantContext.run({ allowUnscoped: true }, async () => {
      await prisma.routineRun.deleteMany({ where: { tenantId } });
      await prisma.routine.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  it('calcula taxa geral, série diária e sequências por rotina', async () => {
    const routine = await run(() =>
      prisma.db.routine.create({ data: { ownerId: userId, name: 'Rotina diária', frequency: 'DAILY' } }),
    );

    const statuses = [
      { offset: 3, status: 'DONE' },
      { offset: 2, status: 'PENDING' },
      { offset: 1, status: 'DONE' },
      { offset: 0, status: 'DONE' },
    ];
    for (const s of statuses) {
      await run(() =>
        prisma.db.routineRun.create({ data: { routineId: routine.id, userId, runDate: dayOffset(s.offset), status: s.status } }),
      );
    }

    const stats = await run(() => service.routineStats(userId, 7));
    expect(stats.days).toBe(7);
    expect(stats.overall.total).toBe(4);
    expect(stats.overall.done).toBe(3);
    expect(stats.overall.rate).toBeCloseTo(0.75);
    expect(stats.overall.streak).toBe(2);
    expect(stats.daily).toHaveLength(7);

    const item = stats.routines.find((r) => r.id === routine.id)!;
    expect(item).toMatchObject({ done: 3, total: 4, streak: 2, bestStreak: 2 });
    expect(item.rate).toBeCloseTo(0.75);
  });

  it('ignora dias não agendados na sequência (rotina em dia fixo)', async () => {
    const scheduled = dayOffset(2);
    const weekly = await run(() =>
      prisma.db.routine.create({
        data: { ownerId: userId, name: 'Dia fixo', frequency: 'WEEKLY', weekdays: [scheduled.getUTCDay()] },
      }),
    );
    await run(() =>
      prisma.db.routineRun.create({ data: { routineId: weekly.id, userId, runDate: dayOffset(2), status: 'DONE' } }),
    );
    await run(() =>
      prisma.db.routineRun.create({ data: { routineId: weekly.id, userId, runDate: dayOffset(1), status: 'DONE' } }),
    );

    const stats = await run(() => service.routineStats(userId, 7));
    const item = stats.routines.find((r) => r.id === weekly.id)!;
    expect(item.total).toBe(2);
    expect(item.streak).toBe(1);
    expect(item.bestStreak).toBe(1);
  });
});
