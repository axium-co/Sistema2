import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/common/tenant-context';
import { AgendaService } from '../src/modules/agenda/agenda.service';

/**
 * Recorrência de eventos (RRULE): expansão de ocorrências, exclusão (EXDATE),
 * edição/remoção por ocorrência (ids sintéticos) e detecção de conflitos.
 */
describe('Recorrência de eventos na agenda', () => {
  const prisma = new PrismaService();
  const audit = { log: async () => undefined } as any;
  const notifications = { notify: async () => undefined } as any;
  const agenda = new AgendaService(prisma, audit, notifications);

  let tenantId: string;
  let userId: string;

  const run = <T>(fn: () => Promise<T> | T) => TenantContext.run({ tenantId, userId }, fn);

  function iso(year: number, month: number, day: number, hour = 10, minute = 0) {
    return new Date(year, month, day, hour, minute, 0, 0).toISOString();
  }

  async function createSeries(title: string, start: { y: number; m: number; d: number }, rule: string) {
    return run(() =>
      agenda.createEvent(
        {
          title,
          startsAt: iso(start.y, start.m, start.d),
          endsAt: iso(start.y, start.m, start.d, 11),
          recurrenceRule: rule,
        },
        userId,
      ),
    );
  }

  const window = (y: number, m: number, fromDay: number, toDay: number) => ({
    from: iso(y, m, fromDay, 0),
    to: iso(y, m, toDay, 23),
  });

  /** Lista os itens de uma série (ocorrências expandidas + exceções pontuais). */
  const ofSeries = (events: any[], seriesId: string) =>
    events.filter((e) => e.masterEventId === seriesId || e.id === seriesId);

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = Date.now();
    const tenant = await prisma.tenant.create({ data: { name: 'Agenda Rec', slug: `agenda-rec-${suffix}` } });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: { tenantId, email: `agenda-${suffix}@test.dev`, passwordHash: 'x', name: 'Tester' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await TenantContext.run({ allowUnscoped: true }, async () => {
      await prisma.event.deleteMany({ where: { tenantId } });
      await prisma.activity.deleteMany({ where: { tenantId } });
      await prisma.calendar.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  it('expande a série em ocorrências com id sintético, ordenadas', async () => {
    const series = await createSeries('Semanal 1', { y: 2027, m: 0, d: 4 }, 'FREQ=WEEKLY');
    const events = ofSeries(await run(() => agenda.listEvents(window(2027, 0, 1, 31))), series.id);
    expect(events).toHaveLength(4);
    expect(events.every((e) => e.isRecurring && e.masterEventId === series.id)).toBe(true);
    expect(events.every((e) => e.id.includes('__'))).toBe(true);
    const times = events.map((e) => new Date(e.startsAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('remove apenas uma ocorrência (EXDATE) mantendo as demais', async () => {
    const series = await createSeries('Semanal 2', { y: 2027, m: 2, d: 1 }, 'FREQ=WEEKLY');
    const before = ofSeries(await run(() => agenda.listEvents(window(2027, 2, 1, 31))), series.id);
    expect(before).toHaveLength(5);

    const victim = before[1];
    await run(() => agenda.removeEvent(victim.id));

    const after = ofSeries(await run(() => agenda.listEvents(window(2027, 2, 1, 31))), series.id);
    expect(after).toHaveLength(4);
    expect(after.some((e) => e.id === victim.id)).toBe(false);

    const master = await run(async () => prisma.db.event.findFirst({ where: { id: series.id } }));
    expect(master.excludedDates).toContain(new Date(victim.startsAt).toISOString());
  });

  it('edita apenas uma ocorrência criando um evento pontual isolado', async () => {
    const series = await createSeries('Semanal 3', { y: 2027, m: 4, d: 3 }, 'FREQ=WEEKLY');
    const before = ofSeries(await run(() => agenda.listEvents(window(2027, 4, 1, 31))), series.id);
    expect(before).toHaveLength(5);

    const target = before[2];
    const exception = await run(() => agenda.updateEvent(target.id, { title: 'Editado (só esta)' }));

    expect(exception.id).not.toBe(series.id);
    expect(exception.recurrenceRule).toBeNull();
    expect(exception.title).toBe('Editado (só esta)');
    expect(new Date(exception.startsAt).toISOString()).toBe(new Date(target.startsAt).toISOString());

    const all = await run(() => agenda.listEvents(window(2027, 4, 1, 31)));
    const after = ofSeries(all, series.id);
    expect(after).toHaveLength(4);
    expect(after.some((e) => e.id === target.id)).toBe(false);
    const replacements = all.filter(
      (e: any) => e.id === exception.id && new Date(e.startsAt).getTime() === new Date(target.startsAt).getTime(),
    );
    expect(replacements).toHaveLength(1);
    expect(replacements[0].title).toBe('Editado (só esta)');
    expect(replacements[0].recurrenceRule).toBeNull();
  });

  it('edita a série inteira pelo id real', async () => {
    const series = await createSeries('Semanal 4', { y: 2027, m: 6, d: 5 }, 'FREQ=WEEKLY');
    await run(() => agenda.updateEvent(series.id, { title: 'Série renomeada' }));
    const events = ofSeries(await run(() => agenda.listEvents(window(2027, 6, 1, 31))), series.id);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.title === 'Série renomeada')).toBe(true);
  });

  it('remove a série inteira pelo id real', async () => {
    const series = await createSeries('Semanal 5', { y: 2027, m: 8, d: 6 }, 'FREQ=WEEKLY');
    await run(() => agenda.removeEvent(series.id));
    const events = await run(() => agenda.listEvents(window(2027, 8, 1, 30)));
    expect(ofSeries(events, series.id)).toHaveLength(0);
  });

  it('rejeita id sintético em evento que não é recorrente', async () => {
    const single = await run(() =>
      agenda.createEvent({ title: 'Pontual', startsAt: iso(2027, 10, 8), endsAt: iso(2027, 10, 8, 11) }, userId),
    );
    const synthetic = `${single.id}__${iso(2027, 10, 8)}`;
    await expect(run(() => agenda.removeEvent(synthetic))).rejects.toThrow('não é recorrente');
    await expect(run(() => agenda.updateEvent(synthetic, { title: 'x' }))).rejects.toThrow('não é recorrente');
  });

  it('detecta conflitos considerando ocorrências recorrentes expandidas', async () => {
    const series = await createSeries('Semanal conflito', { y: 2027, m: 10, d: 1 }, 'FREQ=WEEKLY');
    const created = await run(() =>
      agenda.createEvent(
        { title: 'Encaixe', startsAt: iso(2027, 10, 8, 10, 30), endsAt: iso(2027, 10, 8, 11, 30) },
        userId,
      ),
    );
    expect(created.conflicts.some((c: any) => c.id.startsWith(series.id))).toBe(true);
  });

  it('busca ocorrência pelo id sintético e devolve 404 quando excluída', async () => {
    const series = await createSeries('Semanal get', { y: 2027, m: 11, d: 2 }, 'FREQ=WEEKLY');
    const [first, second] = ofSeries(await run(() => agenda.listEvents(window(2027, 11, 1, 31))), series.id);

    const found = await run(() => agenda.getEvent(first.id));
    expect(found.id).toBe(first.id);
    expect(found.title).toBe('Semanal get');

    await run(() => agenda.removeEvent(second.id));
    await expect(run(() => agenda.getEvent(second.id))).rejects.toThrow('não encontrada');
  });

  it('substitui participantes na edição da série', async () => {
    const series = await createSeries('Semanal pessoas', { y: 2027, m: 11, d: 6 }, 'FREQ=WEEKLY');
    const updated = await run(() => agenda.updateEvent(series.id, { attendees: [{ userId }] }));
    expect(updated.attendees).toHaveLength(1);

    const cleared = await run(() => agenda.updateEvent(series.id, { attendees: [] }));
    expect(cleared.attendees).toHaveLength(0);
  });

  it('detecta conflitos ao editar um evento, ignorando ele mesmo', async () => {
    const a = await run(() =>
      agenda.createEvent({ title: 'A', startsAt: iso(2028, 6, 3, 9), endsAt: iso(2028, 6, 3, 10) }, userId),
    );
    const b = await run(() =>
      agenda.createEvent({ title: 'B', startsAt: iso(2028, 6, 3, 14), endsAt: iso(2028, 6, 3, 15) }, userId),
    );

    const noSelfConflict = await run(() => agenda.updateEvent(b.id, { title: 'B2' }));
    expect(noSelfConflict.conflicts).toHaveLength(0);

    const conflict = await run(() =>
      agenda.updateEvent(b.id, { startsAt: iso(2028, 6, 3, 9, 30), endsAt: iso(2028, 6, 3, 10, 30) }),
    );
    expect(conflict.conflicts.map((c: any) => c.id)).toContain(a.id);
  });

  it('valida RRULE inválida e aceita regras ricas (INTERVAL/BYDAY/COUNT)', async () => {
    await expect(run(() => createSeries('Ruim', { y: 2027, m: 0, d: 4 }, 'FREQ=DIARIAMENTE'))).rejects.toThrow('RRULE');

    const series = await createSeries('Rica', { y: 2028, m: 0, d: 3 }, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4');
    const events = ofSeries(await run(() => agenda.listEvents(window(2028, 0, 1, 31))), series.id);
    expect(events).toHaveLength(4);
    const weekdays = events.map((e) => new Date(e.startsAt).getUTCDay());
    expect(weekdays.every((d) => d === 1 || d === 3)).toBe(true);
  });
});
