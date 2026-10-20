import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RRule } from 'rrule';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { EventDto, UpdateEventDto } from './agenda.dto';

const MAX_OCCURRENCES = 300;
const EVENT_STATUSES = ['CONFIRMED', 'TENTATIVE', 'CANCELLED'];
/** Janela padrão de expansão quando a listagem não informa `from`/`to`. */
const DEFAULT_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

function toDtStart(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Valida uma regra RRULE antes de persistir (lança 400 se inválida). */
function assertValidRecurrence(rule?: string | null) {
  if (!rule) return;
  try {
    RRule.fromString(`DTSTART:20240101T000000Z\nRRULE:${String(rule).replace(/^RRULE:/i, '')}`);
  } catch {
    throw new BadRequestException('Regra de recorrência (RRULE) inválida');
  }
}

/**
 * Interpreta ids sintéticos de ocorrência gerados na expansão de séries
 * (`{eventoId}__{ISO}`), devolvendo o id real do evento-mestre e a data da ocorrência.
 */
function parseEventId(id: string): { masterId: string; occurrence?: Date } {
  const sep = id.lastIndexOf('__');
  if (sep > 0) {
    const raw = id.slice(sep + 2);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(raw)) {
      const occurrence = new Date(raw);
      if (!Number.isNaN(occurrence.getTime())) return { masterId: id.slice(0, sep), occurrence };
    }
  }
  return { masterId: id };
}

@Injectable()
export class AgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async listCalendars(userId: string) {
    const calendars = await this.prisma.db.calendar.findMany({ orderBy: { createdAt: 'asc' } });
    if (calendars.length === 0) {
      const created = await this.prisma.db.calendar.create({
        data: { userId, name: 'Minha agenda', isDefault: true },
      });
      return [created];
    }
    return calendars;
  }

  private readonly eventInclude = {
    calendar: { select: { id: true, name: true, color: true, userId: true } },
    attendees: { include: { user: { select: { id: true, name: true } }, contact: { select: { id: true, fullName: true } } } },
    deal: { select: { id: true, title: true } },
  } as const;

  async listEvents(params: { from?: string; to?: string; userId?: string; dealId?: string }) {
    let from = params.from ? new Date(params.from) : undefined;
    let to = params.to ? new Date(params.to) : undefined;
    if (!from && to) from = new Date(to.getTime() - DEFAULT_WINDOW_MS);
    if (!to && from) to = new Date(from.getTime() + DEFAULT_WINDOW_MS);

    const base: any = { deletedAt: null };
    if (params.dealId) base.dealId = params.dealId;
    if (params.userId) base.calendar = { userId: params.userId };

    let where: any = base;
    if (from || to) {
      const within: any = {};
      if (from) within.gte = from;
      if (to) within.lte = to;
      where = {
        ...base,
        OR: [
          { recurrenceRule: null, ...(Object.keys(within).length ? { startsAt: within } : {}) },
          { recurrenceRule: { not: null }, ...(to ? { startsAt: { lte: to } } : {}) },
        ],
      };
    }

    const events = await this.prisma.db.event.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: this.eventInclude,
    });

    if (!from || !to) return events;

    const expanded: any[] = [];
    for (const event of events) {
      if (!event.recurrenceRule) expanded.push(event);
      else expanded.push(...this.expandEvent(event, from, to));
    }
    expanded.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    return expanded;
  }

  /**
   * Expande um evento recorrente (RRULE) em ocorrências dentro de `[from, to]`,
   * removendo as datas excluídas (`excludedDates`/EXDATE). Cada ocorrência recebe
   * um id sintético `{eventoId}__{ISO}`. Em erro de parsing, devolve o próprio
   * evento original (fail-soft).
   */
  private expandEvent(event: any, from: Date, to: Date): any[] {
    const excluded = new Set<string>(Array.isArray(event.excludedDates) ? event.excludedDates : []);
    try {
      const startsAt = new Date(event.startsAt);
      const duration = new Date(event.endsAt).getTime() - startsAt.getTime();
      const rrule = `RRULE:${String(event.recurrenceRule).replace(/^RRULE:/i, '')}`;
      const rule = RRule.fromString(`DTSTART:${toDtStart(startsAt)}\n${rrule}`);
      const occurrences = rule.between(from, to, true).slice(0, MAX_OCCURRENCES);
      return occurrences
        .filter((occurrence) => !excluded.has(occurrence.toISOString()))
        .map((occurrence) => ({
          ...event,
          id: `${event.id}__${occurrence.toISOString()}`,
          startsAt: occurrence,
          endsAt: new Date(occurrence.getTime() + duration),
          isRecurring: true,
          masterEventId: event.id,
        }));
    } catch {
      return [event];
    }
  }

  /** Aceita id real ou id sintético de ocorrência (`{eventoId}__{ISO}`). */
  async getEvent(id: string) {
    const { masterId, occurrence } = parseEventId(id);
    const include = { attendees: { include: { user: true, contact: true } }, deal: true, calendar: true } as const;
    if (!occurrence) {
      return this.prisma.findByIdOrFail('event', masterId, { include });
    }
    const master = await this.prisma.findByIdOrFail('event', masterId, { include });
    if (!master.recurrenceRule) throw new NotFoundException('Este evento não é recorrente');
    const [found] = this.expandEvent(master, occurrence, occurrence);
    if (!found) throw new NotFoundException('Ocorrência não encontrada');
    return found;
  }

  async createEvent(dto: EventDto, userId: string) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Datas inválidas');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('A data de término deve ser após o início');
    }
    assertValidRecurrence(dto.recurrenceRule);

    let calendarId = dto.calendarId;
    if (!calendarId) {
      const calendars = await this.listCalendars(userId);
      calendarId = calendars[0].id;
    }

    const conflicts = await this.findConflicts(calendarId!, startsAt, endsAt);

    const event = await this.prisma.db.event.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        type: (dto.type as any) ?? 'MEETING',
        color: dto.color ?? '#7C9CBF',
        startsAt,
        endsAt,
        allDay: dto.allDay ?? false,
        location: dto.location ?? null,
        videoLink: dto.videoLink ?? null,
        dealId: dto.dealId ?? null,
        calendarId: calendarId!,
        createdById: userId,
        recurrenceRule: dto.recurrenceRule ?? null,
        reminderMinutes: dto.reminderMinutes ?? 15,
        attendees: dto.attendees?.length
          ? { create: dto.attendees.map((a) => ({ userId: a.userId ?? null, contactId: a.contactId ?? null })) }
          : undefined,
      },
      include: { attendees: true },
    });

    await this.prisma.db.activity.create({
      data: {
        tenantId: event.tenantId,
        type: 'MEETING',
        subject: `Compromisso agendado: ${event.title}`,
        dealId: event.dealId ?? null,
        createdById: userId,
        status: 'DONE',
        occurredAt: startsAt,
      },
    });

    if (event.dealId) {
      const deal = await this.prisma.db.deal.findFirst({ where: { id: event.dealId } });
      if (deal) {
        await this.notifications.notify({
          userId: deal.ownerId,
          type: 'REMINDER',
          title: 'Reunião agendada',
          body: `${event.title} — ${startsAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
          entityType: 'Deal',
          entityId: deal.id,
          url: `/crm/negocios/${deal.id}`,
        });
      }
    }

    await this.audit.log({ entityType: 'Event', entityId: event.id, action: 'CREATE' });
    return { ...event, conflicts };
  }

  async updateEvent(id: string, dto: UpdateEventDto) {
    const { masterId, occurrence } = parseEventId(id);
    const event = await this.prisma.findByIdOrFail('event', masterId, { include: { attendees: true } });
    if (dto.recurrenceRule !== undefined) assertValidRecurrence(dto.recurrenceRule);
    if (dto.status !== undefined && !EVENT_STATUSES.includes(dto.status)) {
      throw new BadRequestException('Status de evento inválido');
    }
    if (occurrence) return this.updateOccurrence(event, occurrence, dto);

    const data: any = { ...dto };
    if (dto.startsAt) data.startsAt = new Date(dto.startsAt);
    if (dto.endsAt) data.endsAt = new Date(dto.endsAt);
    if (dto.attendees) {
      data.attendees = {
        deleteMany: {},
        create: dto.attendees.map((a) => ({ userId: a.userId ?? null, contactId: a.contactId ?? null })),
      };
    }
    const startsAt = data.startsAt ?? new Date(event.startsAt);
    const endsAt = data.endsAt ?? new Date(event.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Datas inválidas');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('A data de término deve ser após o início');
    }
    const updated = await this.prisma.db.event.update({
      where: { id: masterId },
      data,
      include: { attendees: true },
    });
    const conflicts = await this.findConflicts(event.calendarId, startsAt, endsAt, masterId);
    await this.audit.log({ entityType: 'Event', entityId: masterId, action: 'UPDATE', after: dto });
    return { ...updated, conflicts };
  }

  /**
   * Edita apenas uma ocorrência da série: cria um evento pontual com os valores
   * editados e exclui a ocorrência original da repetição (EXDATE), de modo que a
   * série deixa de gerá-la e a edição passa a valer isoladamente.
   */
  private async updateOccurrence(event: any, occurrence: Date, dto: UpdateEventDto) {
    if (!event.recurrenceRule) throw new BadRequestException('Este evento não é recorrente');

    const duration = new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime();
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : occurrence;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : new Date(startsAt.getTime() + duration);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Datas inválidas');
    }
    if (endsAt <= startsAt) throw new BadRequestException('A data de término deve ser após o início');

    const exception = await this.prisma.db.event.create({
      data: {
        title: dto.title ?? event.title,
        description: dto.description ?? event.description,
        type: dto.type ?? event.type,
        color: dto.color ?? event.color,
        startsAt,
        endsAt,
        allDay: dto.allDay ?? event.allDay,
        location: dto.location ?? event.location,
        videoLink: dto.videoLink ?? event.videoLink,
        status: (dto.status as any) ?? event.status,
        dealId: event.dealId,
        calendarId: event.calendarId,
        createdById: event.createdById,
        recurrenceRule: null,
        reminderMinutes: dto.reminderMinutes ?? event.reminderMinutes,
        attendees: dto.attendees
          ? { create: dto.attendees.map((a) => ({ userId: a.userId ?? null, contactId: a.contactId ?? null })) }
          : event.attendees?.length
            ? { create: event.attendees.map((a: any) => ({ userId: a.userId, contactId: a.contactId })) }
            : undefined,
      },
    });

    await this.excludeOccurrence(event, occurrence);

    const conflicts = await this.findConflicts(event.calendarId, startsAt, endsAt, event.id);
    await this.audit.log({ entityType: 'Event', entityId: exception.id, action: 'CREATE', after: dto });
    return { ...exception, conflicts: conflicts.filter((c: any) => c.id !== exception.id) };
  }

  /** Marca uma ocorrência como excluída (EXDATE) na série recorrente. */
  private async excludeOccurrence(event: any, occurrence: Date) {
    const iso = occurrence.toISOString();
    if (Array.isArray(event.excludedDates) && event.excludedDates.includes(iso)) return;
    await this.prisma.db.event.update({
      where: { id: event.id },
      data: { excludedDates: { push: iso } },
    });
    return iso;
  }

  async removeEvent(id: string) {
    const { masterId, occurrence } = parseEventId(id);
    const event = await this.prisma.findByIdOrFail('event', masterId);
    if (occurrence) {
      if (!event.recurrenceRule) throw new BadRequestException('Este evento não é recorrente');
      const iso = await this.excludeOccurrence(event, occurrence);
      if (iso) {
        await this.audit.log({ entityType: 'Event', entityId: masterId, action: 'UPDATE', after: { excludedOccurrence: iso } });
      }
      return { ok: true };
    }
    await this.prisma.db.event.update({ where: { id: masterId }, data: { deletedAt: new Date() } });
    await this.audit.log({ entityType: 'Event', entityId: masterId, action: 'DELETE' });
    return { ok: true };
  }

  async findConflicts(calendarId: string, startsAt: Date, endsAt: Date, ignoreEventId?: string) {
    const base: any = {
      calendarId,
      deletedAt: null,
      status: { not: 'CANCELLED' },
      ...(ignoreEventId ? { id: { not: ignoreEventId } } : {}),
    };

    const [single, recurring] = await Promise.all([
      this.prisma.db.event.findMany({
        where: {
          ...base,
          recurrenceRule: null,
          AND: [{ startsAt: { lt: endsAt } }, { endsAt: { gt: startsAt } }],
        },
        select: { id: true, title: true, startsAt: true, endsAt: true },
      }),
      this.prisma.db.event.findMany({
        where: { ...base, recurrenceRule: { not: null }, startsAt: { lte: endsAt } },
        select: { id: true, title: true, startsAt: true, endsAt: true, recurrenceRule: true, excludedDates: true },
      }),
    ]);

    const conflicts: any[] = [...single];
    for (const event of recurring) {
      // A janela começa antes do novo evento para capturar ocorrências que
      // iniciam antes mas ainda se sobrepõem (início + duração da série).
      const duration = new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime();
      const expandFrom = new Date(startsAt.getTime() - Math.max(0, duration));
      for (const occurrence of this.expandEvent(event, expandFrom, endsAt)) {
        const occStart = new Date(occurrence.startsAt);
        const occEnd = new Date(occurrence.endsAt);
        if (occStart < endsAt && occEnd > startsAt) {
          conflicts.push({ id: occurrence.id, title: event.title, startsAt: occStart, endsAt: occEnd });
        }
      }
    }
    return conflicts;
  }

  async suggestSlots(date: string, durationMinutes = 60) {
    const day = new Date(date);
    if (Number.isNaN(day.getTime())) throw new BadRequestException('Data inválida');
    const start = new Date(day);
    start.setHours(8, 0, 0, 0);
    const end = new Date(day);
    end.setHours(18, 0, 0, 0);

    const busy = await this.prisma.db.event.findMany({
      where: { deletedAt: null, status: { not: 'CANCELLED' }, AND: [{ startsAt: { lt: end } }, { endsAt: { gt: start } }] },
      select: { startsAt: true, endsAt: true },
    });

    const slots: { start: string; end: string }[] = [];
    const step = 30 * 60 * 1000;
    for (let t = start.getTime(); t + durationMinutes * 60000 <= end.getTime(); t += step) {
      const slotStart = new Date(t);
      const slotEnd = new Date(t + durationMinutes * 60000);
      const overlap = busy.some(
        (b: any) => new Date(b.startsAt) < slotEnd && new Date(b.endsAt) > slotStart,
      );
      if (!overlap) slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
    }
    return slots.slice(0, 12);
  }
}
