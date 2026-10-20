import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/common/tenant-context';
import { GoogleCalendarService, mapGoogleEvent } from '../src/modules/integrations/google-calendar.service';

describe('mapGoogleEvent', () => {
  it('mapeia um evento com horário (dateTime)', () => {
    const data = mapGoogleEvent(
      {
        id: 'g1',
        summary: 'Reunião',
        description: 'pauta',
        location: 'Sala 1',
        status: 'confirmed',
        start: { dateTime: '2026-11-01T13:00:00.000Z' },
        end: { dateTime: '2026-11-01T14:00:00.000Z' },
      },
      'cal-1',
      'user-1',
      'tenant-1',
    )!;
    expect(data).toMatchObject({
      externalId: 'g1',
      externalSource: 'google',
      title: 'Reunião',
      allDay: false,
      status: 'CONFIRMED',
      calendarId: 'cal-1',
    });
    expect(data.startsAt.toISOString()).toBe('2026-11-01T13:00:00.000Z');
  });

  it('trata eventos de dia inteiro e título ausente', () => {
    const data = mapGoogleEvent(
      { id: 'g2', status: 'tentative', start: { date: '2026-11-02' }, end: { date: '2026-11-03' } },
      'cal-1',
      'user-1',
      'tenant-1',
    )!;
    expect(data.allDay).toBe(true);
    expect(data.title).toBe('(sem título)');
    expect(data.status).toBe('TENTATIVE');
  });

  it('devolve null quando não há data válida', () => {
    expect(mapGoogleEvent({ id: 'x' }, 'cal', 'u', 't')).toBeNull();
  });
});

describe('GoogleCalendarService (importação)', () => {
  const prisma = new PrismaService();
  const service = new GoogleCalendarService(prisma, { log: async () => {} } as any);

  let tenantId: string;
  let userId: string;
  const run = <T>(fn: () => Promise<T> | T) => TenantContext.run({ tenantId, userId }, fn);

  beforeAll(async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    await prisma.$connect();
    const suffix = Date.now();
    const tenant = await prisma.tenant.create({ data: { name: 'Google', slug: `google-${suffix}` } });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: { tenantId, email: `google-${suffix}@test.dev`, passwordHash: 'x', name: 'Dono', role: 'OWNER' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await TenantContext.run({ allowUnscoped: true }, async () => {
      await prisma.event.deleteMany({ where: { tenantId } });
      await prisma.calendar.deleteMany({ where: { tenantId } });
      await prisma.calendarIntegration.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  it('reporta modo simulado e gera auth-url quando não configurado', async () => {
    const status = await run(() => service.status());
    expect(status).toMatchObject({ configured: false, connected: false });

    const auth = await run(() => service.authUrl());
    expect(auth.mocked).toBe(true);
    expect(auth.url).toContain('mock=1');
  });

  it('importa e depois atualiza eventos do Google de forma idempotente', async () => {
    const items = [
      {
        id: 'evt-1',
        summary: 'Consulta',
        status: 'confirmed',
        start: { dateTime: '2026-12-01T10:00:00.000Z' },
        end: { dateTime: '2026-12-01T11:00:00.000Z' },
      },
    ];
    const first = await run(() => service.importEvents(items));
    expect(first).toEqual({ imported: 1, updated: 0 });

    const rows = await TenantContext.run({ allowUnscoped: true }, () =>
      prisma.event.findMany({ where: { tenantId, externalSource: 'google' } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ externalId: 'evt-1', title: 'Consulta' });

    const second = await run(() =>
      service.importEvents([{ ...items[0], summary: 'Consulta remarcada' }]),
    );
    expect(second).toEqual({ imported: 0, updated: 1 });

    const updated = await TenantContext.run({ allowUnscoped: true }, () =>
      prisma.event.findFirst({ where: { tenantId, externalId: 'evt-1' } }),
    );
    expect(updated?.title).toBe('Consulta remarcada');
  });

  it('sync em modo simulado atualiza lastSyncAt sem rede', async () => {
    await run(() =>
      prisma.calendarIntegration.create({
        data: { tenantId, userId, provider: 'google', enabled: true, remoteCalendarId: 'primary' },
      }),
    );
    const result = await run(() => service.sync());
    expect(result).toMatchObject({ mocked: true, imported: 0 });

    const status = await run(() => service.status());
    expect(status.connected).toBe(true);
    expect(status.lastSyncAt).toBeTruthy();
  });

  it('desconecta a integração', async () => {
    await run(() => service.disconnect());
    const status = await run(() => service.status());
    expect(status.connected).toBe(false);
  });
});
