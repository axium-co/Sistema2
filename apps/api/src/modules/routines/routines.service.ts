import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { WEEKDAYS, FOCUS_MAX_MINUTES } from '@axium/shared';
import type {
  FocusStartDto,
  FocusStopDto,
  HabitDto,
  HabitLogDto,
  RoutineDto,
  RoutineItemDto,
  TimeBlockDto,
  UpdateHabitDto,
  UpdateRoutineDto,
  UpdateRoutineItemDto,
  UpdateTimeBlockDto,
} from './routines.dto';

function notFound(entity: string) {
  return new NotFoundException(`${entity} nao encontrado`);
}

/** Normaliza para meia-noite UTC (a coluna e DATE, sem fuso). */
function toUtcDate(input?: string | Date): Date {
  if (!input) {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  const iso = input.length === 10 ? `${input}T00:00:00.000Z` : input;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Data invalida');
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function dateKey(date: Date): string {
  return toUtcDate(date).toISOString().slice(0, 10);
}

/** Converte dias informados (strings 'MON' ou numeros 0-6) em indices 0-6. */
function normalizeWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<number>();
  for (const raw of value) {
    if (typeof raw === 'number' && raw >= 0 && raw <= 6) {
      out.add(raw);
      continue;
    }
    const idx = (WEEKDAYS as readonly string[]).indexOf(String(raw).toUpperCase());
    if (idx >= 0) out.add(idx);
  }
  return [...out].sort((a, b) => a - b);
}

@Injectable()
export class RoutinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------
  // Rotinas
  // ------------------------------------------------------------------
  private readonly routineInclude = { items: { orderBy: { position: 'asc' as const } } };

  async listRoutines(userId: string) {
    const routines = await this.prisma.db.routine.findMany({
      where: { OR: [{ ownerId: userId }, { isTemplate: true }] },
      orderBy: [{ isTemplate: 'asc' }, { createdAt: 'asc' }],
      include: this.routineInclude,
    });
    return routines.map((r: any) => ({ ...r, isOwner: r.ownerId === userId }));
  }

  async getRoutine(id: string, userId: string) {
    const routine = await this.prisma.findByIdOrFail('routine', id, { include: this.routineInclude });
    if (!routine.isTemplate && routine.ownerId && routine.ownerId !== userId) {
      throw new ForbiddenException('Rotina de outro usuario');
    }
    return { ...routine, isOwner: routine.ownerId === userId };
  }

  async createRoutine(dto: RoutineDto, userId: string) {
    const weekdays = normalizeWeekdays(dto.weekdays ?? []);
    const items = (dto.items ?? []).filter((t) => t.trim().length > 0);
    const routine = await this.prisma.db.routine.create({
      data: {
        ownerId: userId,
        name: dto.name.trim(),
        frequency: dto.frequency ?? 'DAILY',
        weekdays: weekdays as any,
        dayOfMonth: dto.dayOfMonth ?? null,
        defaultTime: dto.defaultTime ?? null,
        isTemplate: dto.isTemplate ?? false,
        sharedById: dto.isTemplate ? userId : null,
        items: {
          create: items.map((title, i) => ({ title: title.trim(), position: (i + 1) * 1000 })),
        },
      },
      include: this.routineInclude,
    });
    await this.audit.log({ entityType: 'Routine', entityId: routine.id, action: 'CREATE', actorId: userId });
    return { ...routine, isOwner: true };
  }

  async updateRoutine(id: string, dto: UpdateRoutineDto, userId: string) {
    const routine = await this.getRoutine(id, userId);
    if (routine.ownerId !== userId) {
      throw new ForbiddenException('Apenas o dono pode editar a rotina');
    }
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.weekdays !== undefined) data.weekdays = normalizeWeekdays(dto.weekdays);
    if (dto.dayOfMonth !== undefined) data.dayOfMonth = dto.dayOfMonth;
    if (dto.defaultTime !== undefined) data.defaultTime = dto.defaultTime;
    if (dto.isTemplate !== undefined) {
      data.isTemplate = dto.isTemplate;
      data.sharedById = dto.isTemplate ? userId : null;
    }
    const updated = await this.prisma.db.routine.update({ where: { id }, data, include: this.routineInclude });
    await this.audit.log({ entityType: 'Routine', entityId: id, action: 'UPDATE', after: dto, actorId: userId });
    return { ...updated, isOwner: true };
  }

  async removeRoutine(id: string, userId: string) {
    const routine = await this.getRoutine(id, userId);
    if (routine.ownerId !== userId) {
      throw new ForbiddenException('Apenas o dono pode excluir a rotina');
    }
    await this.prisma.db.routine.delete({ where: { id } });
    await this.audit.log({ entityType: 'Routine', entityId: id, action: 'DELETE', actorId: userId });
    return { ok: true };
  }

  async addItem(routineId: string, dto: RoutineItemDto, userId: string) {
    const routine = await this.getRoutine(routineId, userId);
    if (routine.ownerId !== userId) throw new ForbiddenException('Apenas o dono pode editar a rotina');
    const last = await this.prisma.db.routineItem.findFirst({
      where: { routineId },
      orderBy: { position: 'desc' },
    });
    return this.prisma.db.routineItem.create({
      data: { routineId, title: dto.title.trim(), position: (last?.position ?? 0) + 1000 },
    });
  }

  async updateItem(itemId: string, dto: UpdateRoutineItemDto, userId: string) {
    const item = await this.prisma.db.routineItem.findUnique({ where: { id: itemId }, include: { routine: true } });
    if (!item) throw notFound('Item de rotina');
    if (item.routine.ownerId !== userId) throw new ForbiddenException('Apenas o dono pode editar a rotina');
    return this.prisma.db.routineItem.update({
      where: { id: itemId },
      data: { ...(dto.title !== undefined ? { title: dto.title.trim() } : {}), ...(dto.position !== undefined ? { position: dto.position } : {}) },
    });
  }

  async removeItem(itemId: string, userId: string) {
    const item = await this.prisma.db.routineItem.findUnique({ where: { id: itemId }, include: { routine: true } });
    if (!item) throw notFound('Item de rotina');
    if (item.routine.ownerId !== userId) throw new ForbiddenException('Apenas o dono pode editar a rotina');
    await this.prisma.db.routineItem.delete({ where: { id: itemId } });
    return { ok: true };
  }

  /** Cria uma copia pessoal a partir de um modelo compartilhado. */
  async cloneRoutine(id: string, userId: string) {
    const routine = await this.getRoutine(id, userId);
    return this.createRoutine(
      {
        name: routine.name,
        frequency: routine.frequency,
        weekdays: routine.weekdays as any,
        dayOfMonth: routine.dayOfMonth ?? undefined,
        defaultTime: routine.defaultTime ?? undefined,
        items: (routine.items ?? []).map((i: any) => i.title),
      },
      userId,
    );
  }

  // ------------------------------------------------------------------
  // Planejador / execucao de rotinas
  // ------------------------------------------------------------------
  private routineMatchesDate(routine: any, date: Date): boolean {
    const freq = String(routine.frequency ?? 'DAILY').toUpperCase();
    const days = normalizeWeekdays(routine.weekdays);
    const weekday = date.getUTCDay();

    if (freq === 'MONTHLY') {
      return date.getUTCDate() === (routine.dayOfMonth ?? 1);
    }
    if (freq === 'CUSTOM' && routine.dayOfMonth) {
      return date.getUTCDate() === routine.dayOfMonth && (days.length === 0 || days.includes(weekday));
    }
    // DAILY e WEEKLY: se dias definidos, restringe a eles; senao todos os dias.
    return days.length === 0 ? true : days.includes(weekday);
  }

  /** Garante que as execucoes do dia existam para o usuario. */
  private async ensureRuns(userId: string, date: Date) {
    const routines = await this.prisma.db.routine.findMany({
      where: { OR: [{ ownerId: userId }, { isTemplate: true }] },
      include: this.routineInclude,
    });
    const matching = routines.filter((r: any) => this.routineMatchesDate(r, date));
    if (!matching.length) return [];

    const existing = await this.prisma.db.routineRun.findMany({
      where: { userId, runDate: date },
    });
    const byRoutine = new Map(existing.map((r: any) => [r.routineId, r]));

    for (const routine of matching) {
      if (byRoutine.has(routine.id)) continue;
      try {
        const run = await this.prisma.db.routineRun.create({
          data: {
            routineId: routine.id,
            userId,
            runDate: date,
            status: 'PENDING',
            checks: { create: (routine.items ?? []).map((i: any) => ({ routineItemId: i.id })) },
          },
        });
        byRoutine.set(routine.id, run);
      } catch {
        // corrida de criacao concorrente: recarrega
        const run = await this.prisma.db.routineRun.findFirst({ where: { routineId: routine.id, userId, runDate: date } });
        if (run) byRoutine.set(routine.id, run);
      }
    }
    return matching;
  }

  private async loadRuns(userId: string, date: Date) {
    await this.ensureRuns(userId, date);
    const runs = await this.prisma.db.routineRun.findMany({
      where: { userId, runDate: date },
      include: {
        routine: { include: this.routineInclude },
        checks: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return runs.map((run: any) => {
      const items = (run.routine?.items ?? []).map((item: any) => {
        const check = run.checks.find((c: any) => c.routineItemId === item.id);
        return { id: item.id, checkId: check?.id ?? null, title: item.title, checked: check?.checked ?? false };
      });
      const checked = items.filter((i: any) => i.checked).length;
      return {
        id: run.id,
        routineId: run.routineId,
        name: run.routine?.name ?? 'Rotina',
        frequency: run.routine?.frequency ?? 'DAILY',
        defaultTime: run.routine?.defaultTime ?? null,
        isTemplate: run.routine?.isTemplate ?? false,
        isOwner: run.routine?.ownerId === userId,
        status: run.status,
        items,
        total: items.length,
        checked,
      };
    });
  }

  private async ensureRoutineRun(runId: string, userId: string) {
    const run = await this.prisma.db.routineRun.findFirst({ where: { id: runId } });
    if (!run) throw notFound('Execucao de rotina');
    if (run.userId !== userId) throw new ForbiddenException('Execucao de outro usuario');
    return run;
  }

  async toggleRunItem(runId: string, itemId: string, checked: boolean, userId: string) {
    const run = await this.ensureRoutineRun(runId, userId);
    const check = await this.prisma.db.routineItemCheck.findFirst({
      where: { routineRunId: run.id, routineItemId: itemId },
    });
    if (check) {
      await this.prisma.db.routineItemCheck.update({
        where: { id: check.id },
        data: { checked, checkedAt: checked ? new Date() : null },
      });
    } else {
      await this.prisma.db.routineItemCheck.create({
        data: { routineRunId: run.id, routineItemId: itemId, checked, checkedAt: checked ? new Date() : null },
      });
    }
    const [total, done] = await Promise.all([
      this.prisma.db.routineItemCheck.count({ where: { routineRunId: run.id } }),
      this.prisma.db.routineItemCheck.count({ where: { routineRunId: run.id, checked: true } }),
    ]);
    const status = total > 0 && done === total ? 'DONE' : 'PENDING';
    await this.prisma.db.routineRun.update({ where: { id: run.id }, data: { status } });
    return { ok: true, status, checked: done, total };
  }

  async completeRun(runId: string, userId: string) {
    const run = await this.ensureRoutineRun(runId, userId);
    const checks = await this.prisma.db.routineItemCheck.findMany({ where: { routineRunId: run.id } });
    const now = new Date();
    for (const c of checks) {
      if (!c.checked) {
        await this.prisma.db.routineItemCheck.update({ where: { id: c.id }, data: { checked: true, checkedAt: now } });
      }
    }
    await this.prisma.db.routineRun.update({ where: { id: run.id }, data: { status: 'DONE' } });
    return { ok: true, status: 'DONE' };
  }

  // ------------------------------------------------------------------
  // Habitos
  // ------------------------------------------------------------------
  async listHabits(userId: string) {
    const habits = await this.prisma.db.habit.findMany({
      where: { userId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { logs: true },
    });
    const today = toUtcDate();
    return habits.map((h: any) => this.withHabitStats(h, today));
  }

  private withHabitStats(habit: any, today: Date) {
    const keys = new Set<string>((habit.logs ?? []).map((l: any) => dateKey(l.logDate)));
    const todayKey = dateKey(today);

    // streak atual (conta a partir de hoje; se ainda nao marcado, de ontem)
    let cursor = new Date(today);
    if (!keys.has(todayKey)) cursor = new Date(today.getTime() - 86400000);
    let streak = 0;
    while (keys.has(dateKey(cursor))) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 86400000);
    }

    // melhor sequencia
    const sorted = [...keys].sort();
    let best = 0;
    let run = 0;
    let prev: string | null = null;
    for (const key of sorted) {
      if (prev) {
        const diff = (new Date(`${key}T00:00:00Z`).getTime() - new Date(`${prev}T00:00:00Z`).getTime()) / 86400000;
        run = diff === 1 ? run + 1 : 1;
      } else {
        run = 1;
      }
      best = Math.max(best, run);
      prev = key;
    }

    const weekAgo = today.getTime() - 6 * 86400000;
    const weekCount = [...keys].filter((k) => new Date(`${k}T00:00:00Z`).getTime() >= weekAgo).length;

    return {
      id: habit.id,
      name: habit.name,
      color: habit.color,
      targetPerWeek: habit.targetPerWeek,
      doneToday: keys.has(todayKey),
      streak,
      bestStreak: best,
      weekCount,
      logs: sorted,
    };
  }

  async createHabit(dto: HabitDto, userId: string) {
    const habit = await this.prisma.db.habit.create({
      data: { userId, name: dto.name.trim(), targetPerWeek: dto.targetPerWeek ?? 5, color: dto.color ?? '#8FBF9F' },
    });
    return this.withHabitStats({ ...habit, logs: [] }, toUtcDate());
  }

  async updateHabit(id: string, dto: UpdateHabitDto, userId: string) {
    const habit = await this.prisma.db.habit.findFirst({ where: { id } });
    if (!habit) throw notFound('Habito');
    if (habit.userId !== userId) throw new ForbiddenException('Habito de outro usuario');
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.targetPerWeek !== undefined) data.targetPerWeek = dto.targetPerWeek;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.archived !== undefined) data.archivedAt = dto.archived ? new Date() : null;
    const updated = await this.prisma.db.habit.update({ where: { id }, data, include: { logs: true } });
    return this.withHabitStats(updated, toUtcDate());
  }

  async removeHabit(id: string, userId: string) {
    const habit = await this.prisma.db.habit.findFirst({ where: { id } });
    if (!habit) throw notFound('Habito');
    if (habit.userId !== userId) throw new ForbiddenException('Habito de outro usuario');
    await this.prisma.db.habit.delete({ where: { id } });
    return { ok: true };
  }

  /** Alterna (marca/desmarca) o registro do habito na data informada. */
  async toggleHabitLog(habitId: string, dto: HabitLogDto, userId: string) {
    const habit = await this.prisma.db.habit.findFirst({ where: { id: habitId } });
    if (!habit) throw notFound('Habito');
    if (habit.userId !== userId) throw new ForbiddenException('Habito de outro usuario');
    const logDate = toUtcDate(dto.date);
    const existing = await this.prisma.db.habitLog.findFirst({ where: { habitId, logDate } });
    if (existing) {
      await this.prisma.db.habitLog.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.db.habitLog.create({ data: { habitId, logDate, value: dto.value ?? 1 } });
    }
    const updated = await this.prisma.db.habit.findFirst({ where: { id: habitId }, include: { logs: true } });
    return this.withHabitStats(updated, toUtcDate());
  }

  async habitStats(habitId: string, userId: string) {
    const habit = await this.prisma.db.habit.findFirst({ where: { id: habitId }, include: { logs: true } });
    if (!habit) throw notFound('Habito');
    if (habit.userId !== userId) throw new ForbiddenException('Habito de outro usuario');
    return this.withHabitStats(habit, toUtcDate());
  }

  // ------------------------------------------------------------------
  // Blocos de tempo (planejador)
  // ------------------------------------------------------------------
  async listTimeBlocks(userId: string, dateInput?: string, from?: string, to?: string) {
    if (from || to) {
      const where: any = { userId };
      if (from || to) where.date = { ...(from ? { gte: toUtcDate(from) } : {}), ...(to ? { lte: toUtcDate(to) } : {}) };
      return this.prisma.db.timeBlock.findMany({ where, orderBy: [{ date: 'asc' }, { startMin: 'asc' }] });
    }
    return this.prisma.db.timeBlock.findMany({
      where: { userId, date: toUtcDate(dateInput) },
      orderBy: { startMin: 'asc' },
      include: { card: { select: { id: true, title: true } } },
    });
  }

  private assertBlockRange(startMin: number, endMin: number) {
    if (endMin <= startMin) throw new BadRequestException('Horario final deve ser depois do inicial');
  }

  async createTimeBlock(dto: TimeBlockDto, userId: string) {
    this.assertBlockRange(dto.startMin, dto.endMin);
    const cardId = dto.cardId ?? null;
    if (cardId) await this.prisma.findByIdOrFail('card', cardId);
    return this.prisma.db.timeBlock.create({
      data: {
        userId,
        title: dto.title.trim(),
        date: toUtcDate(dto.date),
        startMin: dto.startMin,
        endMin: dto.endMin,
        cardId,
        color: dto.color ?? '#7C9CBF',
      },
      include: { card: { select: { id: true, title: true } } },
    });
  }

  async updateTimeBlock(id: string, dto: UpdateTimeBlockDto, userId: string) {
    const block = await this.prisma.db.timeBlock.findFirst({ where: { id } });
    if (!block) throw notFound('Bloco de tempo');
    if (block.userId !== userId) throw new ForbiddenException('Bloco de outro usuario');
    const startMin = dto.startMin ?? block.startMin;
    const endMin = dto.endMin ?? block.endMin;
    this.assertBlockRange(startMin, endMin);
    if (dto.cardId) await this.prisma.findByIdOrFail('card', dto.cardId);
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.date !== undefined) data.date = toUtcDate(dto.date);
    if (dto.startMin !== undefined) data.startMin = dto.startMin;
    if (dto.endMin !== undefined) data.endMin = dto.endMin;
    if (dto.cardId !== undefined) data.cardId = dto.cardId;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.done !== undefined) data.done = dto.done;
    return this.prisma.db.timeBlock.update({
      where: { id },
      data,
      include: { card: { select: { id: true, title: true } } },
    });
  }

  async removeTimeBlock(id: string, userId: string) {
    const block = await this.prisma.db.timeBlock.findFirst({ where: { id } });
    if (!block) throw notFound('Bloco de tempo');
    if (block.userId !== userId) throw new ForbiddenException('Bloco de outro usuario');
    await this.prisma.db.timeBlock.delete({ where: { id } });
    return { ok: true };
  }

  // ------------------------------------------------------------------
  // Foco (Pomodoro)
  // ------------------------------------------------------------------
  async currentFocus(userId: string) {
    return this.prisma.db.focusSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      include: { card: { select: { id: true, title: true } } },
    });
  }

  async startFocus(dto: FocusStartDto, userId: string) {
    const active = await this.currentFocus(userId);
    if (active) return active;
    const cardId = dto.cardId ?? null;
    if (cardId) await this.prisma.findByIdOrFail('card', cardId);
    return this.prisma.db.focusSession.create({
      data: { userId, cardId, label: dto.label ?? null, startedAt: new Date(), minutes: 0 },
      include: { card: { select: { id: true, title: true } } },
    });
  }

  async stopFocus(id: string, dto: FocusStopDto, userId: string) {
    const session = await this.prisma.db.focusSession.findFirst({ where: { id } });
    if (!session) throw notFound('Sessao de foco');
    if (session.userId !== userId) throw new ForbiddenException('Sessao de outro usuario');
    if (session.endedAt) return session;

    const elapsed = Math.max(0, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000));
    const minutes = Math.min(FOCUS_MAX_MINUTES, dto.minutes ?? elapsed);
    if (dto.cancel) {
      await this.prisma.db.focusSession.delete({ where: { id } });
      return { ok: true, cancelled: true };
    }
    const updated = await this.prisma.db.focusSession.update({
      where: { id },
      data: { endedAt: new Date(), minutes },
      include: { card: { select: { id: true, title: true } } },
    });
    if (session.cardId) {
      await this.prisma.db.card.update({ where: { id: session.cardId }, data: { spentMin: { increment: minutes } } });
    }
    return updated;
  }

  async listFocusSessions(userId: string, from?: string, to?: string) {
    const where: any = { userId };
    if (from || to) where.startedAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
    return this.prisma.db.focusSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: { card: { select: { id: true, title: true } } },
    });
  }

  async focusStats(userId: string) {
    const today = toUtcDate();
    const weekStart = new Date(today);
    const dow = (weekStart.getUTCDay() + 6) % 7; // segunda = 0
    weekStart.setUTCDate(weekStart.getUTCDate() - dow);

    const [todayAgg, weekAgg, todayCount, weekCount] = await Promise.all([
      this.prisma.db.focusSession.aggregate({
        where: { userId, startedAt: { gte: today } },
        _sum: { minutes: true },
      }),
      this.prisma.db.focusSession.aggregate({
        where: { userId, startedAt: { gte: weekStart } },
        _sum: { minutes: true },
      }),
      this.prisma.db.focusSession.count({ where: { userId, startedAt: { gte: today } } }),
      this.prisma.db.focusSession.count({ where: { userId, startedAt: { gte: weekStart } } }),
    ]);

    return {
      todayMinutes: todayAgg._sum.minutes ?? 0,
      weekMinutes: weekAgg._sum.minutes ?? 0,
      todaySessions: todayCount,
      weekSessions: weekCount,
    };
  }

  // ------------------------------------------------------------------
  // Plano do dia e revisao semanal
  // ------------------------------------------------------------------
  async dailyPlan(userId: string, dateInput?: string) {
    const date = toUtcDate(dateInput);
    const [routines, timeBlocks, habits] = await Promise.all([
      this.loadRuns(userId, date),
      this.listTimeBlocks(userId, dateKey(date)),
      this.listHabits(userId),
    ]);
    const cards = await this.prisma.db.card.findMany({
      where: { archivedAt: null, completedAt: null, dueDate: { gte: date, lt: new Date(date.getTime() + 86400000) } },
      orderBy: { dueDate: 'asc' },
      select: { id: true, title: true, priority: true, boardId: true, dueDate: true },
    });
    const active = await this.currentFocus(userId);
    const focus = await this.focusStats(userId);

    const routinesDone = routines.filter((r: any) => r.status === 'DONE').length;
    const habitsDone = habits.filter((h: any) => h.doneToday).length;

    return {
      date: dateKey(date),
      routines,
      timeBlocks,
      habits,
      cards,
      focus: { ...focus, active },
      totals: {
        routinesTotal: routines.length,
        routinesDone,
        habitsTotal: habits.length,
        habitsDone,
        focusTodayMinutes: focus.todayMinutes,
      },
    };
  }

  async weeklyReview(userId: string) {
    const today = toUtcDate();
    const weekStart = new Date(today);
    const dow = (weekStart.getUTCDay() + 6) % 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - dow);

    const [runs, habitLogs, focusAgg, habits, cardsDone] = await Promise.all([
      this.prisma.db.routineRun.findMany({ where: { userId, runDate: { gte: weekStart } } }),
      this.prisma.db.habitLog.findMany({
        where: { habit: { userId }, logDate: { gte: weekStart } },
        include: { habit: { select: { id: true, name: true, targetPerWeek: true, color: true } } },
      }),
      this.prisma.db.focusSession.aggregate({ where: { userId, startedAt: { gte: weekStart } }, _sum: { minutes: true } }),
      this.prisma.db.habit.findMany({ where: { userId, archivedAt: null }, select: { id: true, name: true, targetPerWeek: true, color: true } }),
      this.prisma.db.card.count({ where: { completedAt: { gte: weekStart } } }),
    ]);

    const runsDone = runs.filter((r: any) => r.status === 'DONE').length;
    const habitCounts = new Map<string, number>();
    for (const log of habitLogs as any[]) {
      habitCounts.set(log.habitId, (habitCounts.get(log.habitId) ?? 0) + log.value);
    }
    const habitSummary = (habits as any[]).map((h) => ({
      id: h.id,
      name: h.name,
      color: h.color,
      targetPerWeek: h.targetPerWeek,
      count: habitCounts.get(h.id) ?? 0,
      rate: Math.min(1, h.targetPerWeek ? (habitCounts.get(h.id) ?? 0) / h.targetPerWeek : 0),
    }));
    const expected = (habits as any[]).reduce((acc, h) => acc + h.targetPerWeek, 0);
    const done = [...habitCounts.values()].reduce((a, b) => a + b, 0);

    return {
      weekStart: dateKey(weekStart),
      routines: {
        total: runs.length,
        done: runsDone,
        rate: runs.length ? runsDone / runs.length : 0,
      },
      habits: {
        summary: habitSummary,
        expected,
        done,
        rate: expected ? Math.min(1, done / expected) : 0,
      },
      focus: { minutes: focusAgg._sum.minutes ?? 0 },
      tasks: { completed: cardsDone },
    };
  }
}
