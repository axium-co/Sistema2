import { BadRequestException, Injectable } from '@nestjs/common';
import { RRule } from 'rrule';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { EventDto, UpdateEventDto } from './agenda.dto';

const MAX_OCCURRENCES = 300;

function toDtStart(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
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
    const from = params.from ? new Date(params.from) : undefined;
    const to = params.to ? new Date(params.to) : undefined;

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
    return this.expandRecurrences(events, from, to);
  }

  /** Expande eventos recorrentes (RRULE) em ocorrências dentro de um intervalo. */
  private expandRecurrences(events: any[], from: Date, to: Date) {
    const expanded: any[] = [];
    for (const event of events) {
      if (!event.recurrenceRule) {
        expanded.push(event);
        continue;
      }
      try {
        const startsAt = new Date(event.startsAt);
        const duration = new Date(event.endsAt).getTime() - startsAt.getTime();
        const rrule = `RRULE:${String(event.recurrenceRule).replace(/^RRULE:/i, '')}`;
        const rule = RRule.fromString(`DTSTART:${toDtStart(startsAt)}\n${rrule}`);
        const occurrences = rule.between(from, to, true).slice(0, MAX_OCCURRENCES);
        for (const occurrence of occurrences) {
          expanded.push({
            ...event,
            id: `${event.id}__${occurrence.toISOString()}`,
            startsAt: occurrence,
            endsAt: new Date(occurrence.getTime() + duration),
            isRecurring: true,
            masterEventId: event.id,
          });
        }
      } catch {
        expanded.push(event);
      }
    }
    expanded.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    return expanded;
  }

  async getEvent(id: string) {
    return this.prisma.findByIdOrFail('event', id, {
      include: { attendees: { include: { user: true, contact: true } }, deal: true, calendar: true },
    });
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
    const event = await this.prisma.findByIdOrFail('event', id);
    if (!event) throw new BadRequestException('Evento não encontrado');
    const data: any = { ...dto };
    if (dto.startsAt) data.startsAt = new Date(dto.startsAt);
    if (dto.endsAt) data.endsAt = new Date(dto.endsAt);
    const updated = await this.prisma.db.event.update({ where: { id }, data });
    await this.audit.log({ entityType: 'Event', entityId: id, action: 'UPDATE', after: dto });
    return updated;
  }

  async removeEvent(id: string) {
    await this.prisma.findByIdOrFail('event', id);
    await this.prisma.db.event.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ entityType: 'Event', entityId: id, action: 'DELETE' });
    return { ok: true };
  }

  async findConflicts(calendarId: string, startsAt: Date, endsAt: Date, ignoreEventId?: string) {
    return this.prisma.db.event.findMany({
      where: {
        calendarId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        ...(ignoreEventId ? { id: { not: ignoreEventId } } : {}),
        AND: [{ startsAt: { lt: endsAt } }, { endsAt: { gt: startsAt } }],
      },
      select: { id: true, title: true, startsAt: true, endsAt: true },
    });
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
