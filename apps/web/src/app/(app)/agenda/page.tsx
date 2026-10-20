'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, Pencil, Video, RefreshCw, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, Modal, Select, Skeleton, Textarea } from '@/components/ui';
import { EVENT_COLORS, EVENT_TYPE_LABELS, formatDate, formatTime, toDateInput } from '@/lib/labels';
import {
  buildRecurrenceRule,
  defaultRecurrenceFields,
  describeRecurrence,
  intervalUnit,
  parseRecurrenceRule,
  weekdayCode,
  RECURRENCE_END_OPTIONS,
  RECURRENCE_FREQ_OPTIONS,
  WEEKDAY_OPTIONS,
  type RecurrenceEnd,
  type RecurrenceFreq,
} from '@/lib/recurrence';
import { cn } from '@/lib/utils';

type View = 'day' | 'week' | 'month';

interface EventForm {
  _editingId?: string;
  _occurrenceId?: string;
  _scope?: 'this';
  title: string;
  type: string;
  color?: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  videoLink?: string;
  description?: string;
  reminderMinutes: number;
  recurrence: '' | RecurrenceFreq;
  interval: number;
  byDay: string[];
  end: RecurrenceEnd;
  count: number;
  until: string;
  attendees?: { userId: string }[];
}

export default function AgendaPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(new Date());
  const [form, setForm] = useState<EventForm | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [scopePrompt, setScopePrompt] = useState<'edit' | 'delete' | null>(null);
  const [scopeChoice, setScopeChoice] = useState<'this' | 'all'>('this');
  const [conflicts, setConflicts] = useState<any[]>([]);

  const range = useMemo(() => {
    if (view === 'day') return { from: startOfDay(cursor), to: endOfDayLocal(cursor) };
    if (view === 'week') return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) };
    return { from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) };
  }, [view, cursor]);

  const { data: events, isLoading } = useQuery({
    queryKey: ['events', range.from.toISOString(), range.to.toISOString()],
    queryFn: () => api.get<any[]>(`/api/agenda/events?from=${range.from.toISOString()}&to=${range.to.toISOString()}`),
  });

  const { data: users } = useQuery({ queryKey: ['users-min'], queryFn: () => api.get<any[]>('/api/users'), retry: false });

  const { data: google } = useQuery({
    queryKey: ['google-status'],
    queryFn: () => api.get<any>('/api/integrations/google/status'),
    retry: false,
  });

  const connectGoogle = useMutation({
    mutationFn: () => api.get<{ url: string; mocked: boolean }>('/api/integrations/google/auth-url'),
    onSuccess: (res) => {
      if (res?.url) window.open(res.url, '_blank', 'noopener');
      toast.info('Conclua a autorização do Google na nova aba e depois clique em Sincronizar');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const syncGoogle = useMutation({
    mutationFn: () => api.post<any>('/api/integrations/google/sync'),
    onSuccess: (res) => {
      if (res?.mocked) toast.info('Google Calendar em modo simulado (credenciais não configuradas)');
      else toast.success(`Sincronizado: ${res.imported} importado(s), ${res.exported} enviado(s)`);
      qc.invalidateQueries({ queryKey: ['google-status'] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async (f: EventForm) => {
      const isOccurrenceEdit = !!f._editingId && f._scope === 'this' && !!f._occurrenceId;
      const payload: any = {
        title: f.title,
        type: f.type,
        startsAt: f.startsAt,
        endsAt: f.endsAt,
        location: f.location ?? '',
        videoLink: f.videoLink ?? '',
        description: f.description ?? '',
        reminderMinutes: Number(f.reminderMinutes) || 0,
      };
      if (f.color) payload.color = f.color;
      if (!isOccurrenceEdit) {
        const rule = buildRecurrenceRule({ freq: f.recurrence, interval: f.interval, byDay: f.byDay, end: f.end, count: f.count, until: f.until });
        if (rule) payload.recurrenceRule = rule;
        else if (f._editingId) payload.recurrenceRule = null;
      }
      if (f._editingId) {
        const id = isOccurrenceEdit ? f._occurrenceId! : f._editingId;
        return api.patch(`/api/agenda/events/${encodeURIComponent(id)}`, payload);
      }
      if (f.attendees?.length) payload.attendees = f.attendees;
      return api.post('/api/agenda/events', payload);
    },
    onSuccess: (res: any, f: EventForm) => {
      if (res?.conflicts?.length) toast.warning(`${res.conflicts.length} conflito(s) de horário detectado(s)`);
      else toast.success(f._editingId ? 'Compromisso atualizado' : 'Compromisso agendado');
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['my-day'] });
      setForm(null);
      setSelected(null);
      setConflicts([]);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: ({ id }: { id: string }) => api.del(`/api/agenda/events/${encodeURIComponent(id)}`),
    onSuccess: (_res, vars) => {
      toast.success(vars.id.includes('__') ? 'Ocorrência removida' : 'Compromisso removido');
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['my-day'] });
      setSelected(null);
      setScopePrompt(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openNew(date?: Date, hour = 9) {
    const base = date ?? cursor;
    const start = new Date(base);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1);
    setForm({
      title: '',
      type: 'MEETING',
      startsAt: toDateInput(start),
      endsAt: toDateInput(end),
      reminderMinutes: 15,
      recurrence: '',
      ...defaultRecurrenceFields(),
    });
  }

  function openEdit(event: any, scope?: 'this' | 'all') {
    const parsed = parseRecurrenceRule(event.recurrenceRule);
    const isOccurrence = !!event.isRecurring;
    const single = scope === 'this';
    setForm({
      _editingId: isOccurrence ? event.masterEventId : event.id,
      _occurrenceId: isOccurrence ? event.id : undefined,
      _scope: single ? 'this' : undefined,
      title: event.title ?? '',
      type: event.type ?? 'MEETING',
      color: event.color,
      startsAt: toDateInput(event.startsAt),
      endsAt: toDateInput(event.endsAt),
      location: event.location ?? '',
      videoLink: event.videoLink ?? '',
      description: event.description ?? '',
      reminderMinutes: event.reminderMinutes ?? 15,
      recurrence: single ? '' : parsed.freq,
      interval: parsed.interval,
      byDay: parsed.byDay,
      end: parsed.end,
      count: parsed.count,
      until: parsed.until,
    });
  }

  function handleEdit() {
    if (!selected) return;
    if (selected.isRecurring) {
      setScopeChoice('this');
      setScopePrompt('edit');
    } else {
      openEdit(selected);
    }
  }

  function handleRemove() {
    if (!selected) return;
    if (selected.isRecurring) {
      setScopeChoice('this');
      setScopePrompt('delete');
    } else {
      remove.mutate({ id: selected.id });
    }
  }

  function confirmScope() {
    if (!selected || !scopePrompt) return;
    if (scopePrompt === 'edit') {
      openEdit(selected, scopeChoice);
      setScopePrompt(null);
      return;
    }
    const onlyThis = scopeChoice === 'this';
    remove.mutate({ id: onlyThis ? selected.id : selected.masterEventId ?? selected.id });
  }

  const label =
    view === 'month'
      ? format(cursor, "MMMM 'de' yyyy", { locale: ptBR })
      : view === 'week'
        ? `Semana de ${format(range.from, 'dd/MM')} – ${format(range.to, 'dd/MM')}`
        : format(cursor, "EEEE, dd 'de' MMMM", { locale: ptBR });

  function step(dir: number) {
    setCursor((c) => (view === 'month' ? addMonths(c, dir) : view === 'week' ? addWeeks(c, dir) : addDays(c, dir)));
  }

  return (
    <div className="flex h-full flex-col pb-6">
      <PageHeader
        eyebrow="Sua rotina"
        title="Agenda"
        description="Compromissos, visitas e follow-ups em um só calendário."
        actions={
          <div className="flex items-center gap-2">
            {google?.connected ? (
              <Button variant="ghost" onClick={() => syncGoogle.mutate()} disabled={syncGoogle.isPending}>
                <RefreshCw size={15} className={syncGoogle.isPending ? 'animate-spin' : undefined} /> Sincronizar
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => connectGoogle.mutate()} disabled={connectGoogle.isPending}>
                <Link2 size={15} /> Google Calendar
              </Button>
            )}
            <Button onClick={() => openNew()}>
              <Plus size={15} /> Novo compromisso
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-4 lg:px-8">
        <div className="flex items-center gap-2">
          <button onClick={() => step(-1)} className="rounded-lg border border-white/10 p-2 text-muted hover:bg-white/5 hover:text-fg">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setCursor(new Date())} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted hover:bg-white/5 hover:text-fg">
            Hoje
          </button>
          <button onClick={() => step(1)} className="rounded-lg border border-white/10 p-2 text-muted hover:bg-white/5 hover:text-fg">
            <ChevronRight size={16} />
          </button>
          <span className="ml-2 text-sm font-semibold capitalize text-fg">{label}</span>
        </div>
        <div className="flex rounded-full border border-white/10 p-0.5">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn('rounded-full px-3 py-1.5 text-xs transition-colors', view === v ? 'bg-white/10 text-fg' : 'text-muted hover:text-fg')}
            >
              {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 lg:px-8">
        {isLoading ? (
          <Skeleton className="h-96" />
        ) : view === 'month' ? (
          <MonthGrid cursor={cursor} events={events ?? []} onSelect={setSelected} onNew={openNew} />
        ) : view === 'week' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => {
              const day = addDays(range.from, i);
              const dayEvents = (events ?? []).filter((e) => isSameDay(new Date(e.startsAt), day));
              const today = isSameDay(day, new Date());
              return (
                <div key={i} className="min-h-[300px] rounded-2xl border border-white/5 bg-surface p-2">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className={cn('text-xs font-medium capitalize', today ? 'text-fg' : 'text-muted')}>{format(day, 'EEE dd', { locale: ptBR })}</span>
                    <button onClick={() => openNew(day)} className="text-faint hover:text-fg">
                      <Plus size={13} />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {dayEvents.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setSelected(e)}
                        className="w-full rounded-lg border-l-2 bg-elevated px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                        style={{ borderColor: e.color ?? EVENT_COLORS[e.type] }}
                      >
                        <p className="text-[11px] text-faint">{formatTime(e.startsAt)}</p>
                        <p className="truncate text-xs text-fg">{e.title}</p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Card glow={false}>
            {(() => {
              const dayEvents = (events ?? []).filter((e) => isSameDay(new Date(e.startsAt), cursor));
              if (dayEvents.length === 0) return <EmptyState title="Nenhum compromisso" description="Clique em novo para agendar." action={<Button onClick={() => openNew(cursor)}>Novo compromisso</Button>} />;
              return (
                <div className="divide-y divide-white/5">
                  {dayEvents.map((e) => (
                    <button key={e.id} onClick={() => setSelected(e)} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02]">
                      <span className="h-10 w-1 rounded-full" style={{ backgroundColor: e.color ?? EVENT_COLORS[e.type] }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-fg">{e.title}</p>
                        <p className="text-xs text-faint">
                          {formatTime(e.startsAt)} – {formatTime(e.endsAt)} · {EVENT_TYPE_LABELS[e.type]}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}
          </Card>
        )}
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?._editingId ? 'Editar compromisso' : 'Novo compromisso'}>
        {form && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
            className="space-y-4"
          >
            {form._scope === 'this' && (
              <p className="rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
                Editando somente esta ocorrência — as demais repetições não serão afetadas.
              </p>
            )}
            <Field label="Título">
              <Input autoFocus required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Reunião de proposta" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tipo">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Local">
                <Input value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Início">
                <Input type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              </Field>
              <Field label="Término">
                <Input type="datetime-local" required value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Repetição">
                <Select
                  value={form.recurrence}
                  disabled={form._scope === 'this'}
                  onChange={(e) => setForm({ ...form, recurrence: e.target.value as EventForm['recurrence'] })}
                >
                  {RECURRENCE_FREQ_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Lembrete (min)" hint="Antecedência da notificação">
                <Input
                  type="number"
                  min={0}
                  value={form.reminderMinutes}
                  onChange={(e) => setForm({ ...form, reminderMinutes: Number(e.target.value) })}
                />
              </Field>
            </div>
            {form.recurrence && form._scope !== 'this' && (
              <RecurrenceFields form={form} setForm={setForm} />
            )}
            <Field label="Link de vídeo">
              <Input value={form.videoLink ?? ''} onChange={(e) => setForm({ ...form, videoLink: e.target.value })} placeholder="https://" />
            </Field>
            <Field label="Descrição">
              <Textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            {!form._editingId && (users ?? []).length > 0 && (
              <Field label="Participantes">
                <div className="flex flex-wrap gap-2">
                  {(users ?? []).map((u) => {
                    const on = (form.attendees ?? []).some((a: any) => a.userId === u.id);
                    return (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() =>
                          setForm({
                            ...form,
                            attendees: on
                              ? (form.attendees ?? []).filter((a: any) => a.userId !== u.id)
                              : [...(form.attendees ?? []), { userId: u.id }],
                          })
                        }
                        className={cn('rounded-full border px-3 py-1 text-xs', on ? 'border-white/30 bg-white/10 text-fg' : 'border-white/10 text-muted hover:text-fg')}
                      >
                        {u.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
            {conflicts.length > 0 && (
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                {conflicts.length} conflito(s): {conflicts.map((c) => c.title).join(', ')}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Salvando…' : form._editingId ? 'Salvar' : 'Agendar'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!scopePrompt} onClose={() => setScopePrompt(null)} title="Compromisso recorrente">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Este compromisso se repete. O que você deseja {scopePrompt === 'edit' ? 'editar' : 'remover'}?
          </p>
          <div className="space-y-2">
            {([
              { value: 'this' as const, label: 'Somente esta ocorrência', hint: 'Apenas o compromisso exibido' },
              { value: 'all' as const, label: 'Toda a repetição', hint: 'A série inteira' },
            ]).map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setScopeChoice(opt.value)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors',
                  scopeChoice === opt.value ? 'border-white/30 bg-white/10' : 'border-white/10 hover:bg-white/5',
                )}
              >
                <span className="text-sm text-fg">{opt.label}</span>
                <span className="text-xs text-faint">{opt.hint}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setScopePrompt(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmScope} disabled={remove.isPending}>
              {scopePrompt === 'edit' ? 'Continuar' : remove.isPending ? 'Removendo…' : 'Remover'}
            </Button>
          </div>
        </div>
      </Modal>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? ''} subtitle={selected ? EVENT_TYPE_LABELS[selected.type] : ''}>
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge color={selected.color ?? EVENT_COLORS[selected.type]}>{EVENT_TYPE_LABELS[selected.type]}</Badge>
              {selected.recurrenceRule && <Badge color="#A89BC9">{describeRecurrence(selected.recurrenceRule) ?? 'Recorrente'}</Badge>}
              {selected.deal && <Badge>{selected.deal.title}</Badge>}
            </div>
            <div className="space-y-2 text-sm text-muted">
              <p className="flex items-center gap-2">
                <Clock size={15} /> {formatDate(selected.startsAt, true)} – {formatTime(selected.endsAt)}
              </p>
              {selected.location && (
                <p className="flex items-center gap-2">
                  <MapPin size={15} /> {selected.location}
                </p>
              )}
              {selected.videoLink && (
                <a href={selected.videoLink} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-info hover:underline">
                  <Video size={15} /> Entrar na reunião
                </a>
              )}
            </div>
            {selected.description && <p className="whitespace-pre-wrap text-sm text-fg">{selected.description}</p>}
            {selected.attendees?.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted">Participantes</p>
                <div className="flex flex-wrap gap-2">
                  {selected.attendees.map((a: any, i: number) => (
                    <Badge key={i}>{a.user?.name ?? a.contact?.fullName ?? '—'}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-4">
              <Button variant="ghost" onClick={handleEdit}>
                <Pencil size={14} /> Editar
              </Button>
              <Button variant="danger" onClick={handleRemove} disabled={remove.isPending}>
                Remover compromisso
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function RecurrenceFields({ form, setForm }: { form: EventForm; setForm: (f: EventForm) => void }) {
  const effectiveByDay = form.byDay.length ? form.byDay : form.startsAt ? [weekdayCode(new Date(form.startsAt))] : [];
  const previewRule = buildRecurrenceRule({ freq: form.recurrence, interval: form.interval, byDay: effectiveByDay, end: form.end, count: form.count, until: form.until });

  function toggleDay(code: string) {
    const order = WEEKDAY_OPTIONS.map((w) => w.value);
    const next = effectiveByDay.includes(code)
      ? effectiveByDay.filter((c) => c !== code)
      : [...effectiveByDay, code].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    setForm({ ...form, byDay: next });
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/5 bg-elevated/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">A cada</span>
        <Input
          type="number"
          min={1}
          className="w-20"
          value={form.interval}
          onChange={(e) => setForm({ ...form, interval: Math.max(1, Number(e.target.value) || 1) })}
        />
        <span className="text-xs text-muted">{intervalUnit(form.recurrence, form.interval)}</span>
      </div>
      {form.recurrence === 'WEEKLY' && (
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_OPTIONS.map((w) => (
            <button
              type="button"
              key={w.value}
              onClick={() => toggleDay(w.value)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                effectiveByDay.includes(w.value) ? 'border-white/30 bg-white/10 text-fg' : 'border-white/10 text-muted hover:text-fg',
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Fim</span>
        <Select value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value as RecurrenceEnd })} className="w-40">
          {RECURRENCE_END_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {form.end === 'count' && (
          <Input
            type="number"
            min={1}
            className="w-20"
            value={form.count}
            onChange={(e) => setForm({ ...form, count: Math.max(1, Number(e.target.value) || 1) })}
          />
        )}
        {form.end === 'until' && <Input type="date" className="w-40" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} />}
      </div>
      {previewRule && <p className="text-xs text-faint">{describeRecurrence(previewRule)}</p>}
    </div>
  );
}

function endOfDayLocal(d: Date) {
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end;
}

function MonthGrid({ cursor, events, onSelect, onNew }: { cursor: Date; events: any[]; onSelect: (e: any) => void; onNew: (d: Date) => void }) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  return (
    <Card glow={false} className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-white/5">
        {weekdays.map((w) => (
          <div key={w} className="px-3 py-2 text-center text-eyebrow uppercase text-faint">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayEvents = events.filter((e) => isSameDay(new Date(e.startsAt), day));
          const inMonth = isSameMonth(day, cursor);
          const today = isSameDay(day, new Date());
          return (
            <div
              key={i}
              onClick={() => onNew(day)}
              className={cn('min-h-[96px] cursor-pointer border-b border-r border-white/5 p-1.5 transition-colors hover:bg-white/[0.02]', !inMonth && 'opacity-40')}
            >
              <div className={cn('mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs', today ? 'bg-white text-bg' : 'text-muted')}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelect(e);
                    }}
                    className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-white/5"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: e.color ?? EVENT_COLORS[e.type] }} />
                    <span className="truncate text-muted">{e.title}</span>
                  </button>
                ))}
                {dayEvents.length > 3 && <p className="px-1 text-[10px] text-faint">+{dayEvents.length - 3}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
