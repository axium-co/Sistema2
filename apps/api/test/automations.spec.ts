import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/common/tenant-context';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { AutomationsService } from '../src/modules/automations/automations.service';

/**
 * Motor de automações: disparo por gatilho, condições e ações (notificar,
 * criar atividade e criar tarefa), com execução best-effort.
 */
describe('Automações de CRM', () => {
  const prisma = new PrismaService();
  const bus = { publish: () => undefined, subscribe: () => () => undefined } as any;
  const notifications = new NotificationsService(prisma, bus);
  const automations = new AutomationsService(prisma, notifications);

  let tenantId: string;
  let userId: string;
  let pipelineId: string;
  let stageId: string;
  let boardId: string;

  const run = <T>(fn: () => Promise<T> | T) => TenantContext.run({ tenantId, userId }, fn);

  const dealOf = (overrides: Record<string, unknown> = {}) =>
    ({
      id: randomUUID(),
      title: 'Proposta ACME',
      ownerId: userId,
      stageId,
      pipelineId,
      amount: 1000,
      ...overrides,
    }) as any;

  const countNotifications = () => run(async () => prisma.db.notification.count({ where: { type: 'AUTOMATION' } }));

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = Date.now();
    const tenant = await prisma.tenant.create({ data: { name: 'Autom', slug: `autom-${suffix}` } });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: { tenantId, email: `autom-${suffix}@test.dev`, passwordHash: 'x', name: 'Autora' },
    });
    userId = user.id;
    const pipeline = await prisma.pipeline.create({ data: { tenantId, name: 'Vendas' } });
    pipelineId = pipeline.id;
    const stage = await prisma.pipelineStage.create({ data: { pipelineId, name: 'Novo', position: 1 } });
    stageId = stage.id;
    const board = await prisma.board.create({ data: { tenantId, createdById: userId, name: 'Tarefas' } });
    boardId = board.id;
    await prisma.list.create({ data: { boardId, name: 'A fazer', position: 1 } });
  });

  afterAll(async () => {
    await TenantContext.run({ allowUnscoped: true }, async () => {
      await prisma.automationRule.deleteMany({ where: { tenantId } });
      await prisma.notification.deleteMany({ where: { tenantId } });
      await prisma.activity.deleteMany({ where: { tenantId } });
      await prisma.card.deleteMany({ where: { tenantId } });
      await prisma.list.deleteMany({ where: { boardId } });
      await prisma.board.deleteMany({ where: { id: boardId } });
      await prisma.pipelineStage.deleteMany({ where: { pipelineId } });
      await prisma.pipeline.deleteMany({ where: { id: pipelineId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  it('notifica o responsável a partir de uma regra sem condições', async () => {
    const rule = await run(() =>
      automations.create(
        { name: 'Avisar responsável', trigger: 'DEAL_WON', action: 'NOTIFY_OWNER', actionConfig: { title: 'Ganhou {{title}}' } },
        userId,
      ),
    );
    await run(() => automations.run('DEAL_WON', dealOf()));

    const list = await run(async () => prisma.db.notification.findMany({ where: { type: 'AUTOMATION' } }));
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Ganhou Proposta ACME');

    const refreshed = await run(async () => prisma.db.automationRule.findFirst({ where: { id: rule.id } }));
    expect(refreshed?.runCount).toBe(1);
    expect(refreshed?.lastRunAt).toBeTruthy();
  });

  it('respeita condições de etapa e valor mínimo', async () => {
    await run(() =>
      automations.create(
        {
          name: 'Só etapa Novo',
          trigger: 'DEAL_CREATED',
          conditions: { stageId, minAmount: 5000 },
          action: 'NOTIFY_OWNER',
          actionConfig: {},
        },
        userId,
      ),
    );

    await run(() => automations.run('DEAL_CREATED', dealOf({ amount: 1000 })));
    expect(await countNotifications()).toBe(1);

    await run(() => automations.run('DEAL_CREATED', dealOf({ amount: 9000 })));
    expect(await countNotifications()).toBe(2);
  });

  it('avalia DEAL_STAGE_CHANGED pela etapa de destino', async () => {
    const otherStage = await run(async () =>
      prisma.db.pipelineStage.create({ data: { pipelineId, name: 'Proposta', position: 2 } }),
    );
    await run(() =>
      automations.create(
        {
          name: 'Entrou em Proposta',
          trigger: 'DEAL_STAGE_CHANGED',
          conditions: { stageId: otherStage.id },
          action: 'NOTIFY_OWNER',
          actionConfig: {},
        },
        userId,
      ),
    );

    const before = await countNotifications();
    await run(() =>
      automations.run('DEAL_STAGE_CHANGED', dealOf({ stageId: otherStage.id }), {
        fromStageId: stageId,
        toStageId: otherStage.id,
      }),
    );
    expect(await countNotifications()).toBe(before + 1);
  });

  it('cria atividade e tarefa conforme a ação configurada', async () => {
    const deal = await run(async () =>
      prisma.db.deal.create({
        data: { title: 'Proposta ACME', pipelineId, stageId, ownerId: userId, amount: 100, status: 'PERDIDO' },
      }),
    );
    await run(() =>
      automations.create(
        {
          name: 'Ligar depois',
          trigger: 'DEAL_LOST',
          action: 'CREATE_ACTIVITY',
          actionConfig: { type: 'CALL', subject: 'Retomar {{title}}', dueInDays: 2 },
        },
        userId,
      ),
    );
    await run(() =>
      automations.create(
        { name: 'Criar follow-up', trigger: 'DEAL_LOST', action: 'CREATE_TASK', actionConfig: { boardId } },
        userId,
      ),
    );

    await run(() => automations.run('DEAL_LOST', dealOf({ id: deal.id })));

    const activity = await run(async () => prisma.db.activity.findFirst({ where: { dealId: deal.id } }));
    expect(activity).toMatchObject({ type: 'CALL', subject: 'Retomar Proposta ACME' });
    expect(activity?.dueAt).toBeTruthy();

    const card = await run(async () =>
      prisma.db.card.findFirst({ where: { dealId: deal.id }, include: { assignees: true } }),
    );
    expect(card?.title).toBe('Follow-up: Proposta ACME');
    expect(card?.assignees.map((a: any) => a.userId)).toContain(userId);

    await run(async () => prisma.db.deal.delete({ where: { id: deal.id } }));
  });

  it('ignora regras desabilitadas e valida gatilho/ação', async () => {
    const rule = await run(() =>
      automations.create(
        { name: 'Desligada', trigger: 'DEAL_LOST', action: 'NOTIFY_OWNER', actionConfig: {}, enabled: false },
        userId,
      ),
    );
    const before = await countNotifications();
    await run(() => automations.run('DEAL_LOST', dealOf()));
    expect(await countNotifications()).toBe(before);

    await expect(
      run(() => automations.create({ name: 'Ruim', trigger: 'FOO', action: 'NOTIFY_OWNER' }, userId)),
    ).rejects.toThrow('Gatilho');
    await expect(
      run(() => automations.create({ name: 'Ruim', trigger: 'DEAL_WON', action: 'BAR' }, userId)),
    ).rejects.toThrow('Ação');

    const toggled = await run(() => automations.toggle(rule.id));
    expect(toggled.enabled).toBe(true);
  });
});
