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
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, Video } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, Modal, Select, Skeleton, Textarea } from '@/components/ui';
import { EVENT_COLORS, EVENT_TYPE_LABELS, formatDate, formatTime, toDateInput } from '@/lib/labels';
import { cn } from '@/lib/utils';

type View = 'day' | 'week' | 'month';

export default function AgendaPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(new Date());
  const [creating, setCreating] = useState<any | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
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

  const create = useMutation({
    mutationFn: (payload: any) => api.post('/api/agenda/events', payload),
    onSuccess: (res: any) => {
      if (res?.conflicts?.length) toast.warning(`${res.conflicts.length} conflito(s) de horário detectado(s)`);
      else toast.success('Compromisso agendado');
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['my-day'] });
      setCreating(null);
      setConflicts([]);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/agenda/events/${id}`),
    onSuccess: () => {
      toast.success('Compromisso removido');
      qc.invalidateQueries({ queryKey: ['events'] });
      setSelected(null);
    },
  });

  function openNew(date?: Date, hour = 9) {
    const base = date ?? cursor;
    const start = new Date(base);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1);
    setCreating({
      title: '',
      type: 'MEETING',
      startsAt: toDateInput(start),
      endsAt: toDateInput(end),
      _date: date ?? cursor,
    });
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
          <Button onClick={() => openNew()}>
            <Plus size={15} /> Novo compromisso
          </Button>
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

      <Modal open={!!creating} onClose={() => setCreating(null)} title="Novo compromisso">
        {creating && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(creating);
            }}
            className="space-y-4"
          >
            <Field label="Título">
              <Input autoFocus required value={creating.title} onChange={(e) => setCreating({ ...creating, title: e.target.value })} placeholder="Ex.: Reunião de proposta" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tipo">
                <Select value={creating.type} onChange={(e) => setCreating({ ...creating, type: e.target.value })}>
                  {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Local">
                <Input value={creating.location ?? ''} onChange={(e) => setCreating({ ...creating, location: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Início">
                <Input type="datetime-local" required value={creating.startsAt} onChange={(e) => setCreating({ ...creating, startsAt: e.target.value })} />
              </Field>
              <Field label="Término">
                <Input type="datetime-local" required value={creating.endsAt} onChange={(e) => setCreating({ ...creating, endsAt: e.target.value })} />
              </Field>
            </div>
            <Field label="Link de vídeo">
              <Input value={creating.videoLink ?? ''} onChange={(e) => setCreating({ ...creating, videoLink: e.target.value })} placeholder="https://" />
            </Field>
            <Field label="Descrição">
              <Textarea value={creating.description ?? ''} onChange={(e) => setCreating({ ...creating, description: e.target.value })} />
            </Field>
            {(users ?? []).length > 0 && (
              <Field label="Participantes">
                <div className="flex flex-wrap gap-2">
                  {(users ?? []).map((u) => {
                    const on = (creating.attendees ?? []).some((a: any) => a.userId === u.id);
                    return (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() =>
                          setCreating({
                            ...creating,
                            attendees: on
                              ? (creating.attendees ?? []).filter((a: any) => a.userId !== u.id)
                              : [...(creating.attendees ?? []), { userId: u.id }],
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
              <Button type="button" variant="ghost" onClick={() => setCreating(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Agendando…' : 'Agendar'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? ''} subtitle={selected ? EVENT_TYPE_LABELS[selected.type] : ''}>
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge color={selected.color ?? EVENT_COLORS[selected.type]}>{EVENT_TYPE_LABELS[selected.type]}</Badge>
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
            <div className="flex justify-end border-t border-white/5 pt-4">
              <Button variant="danger" onClick={() => remove.mutate(selected.id)}>
                Remover compromisso
              </Button>
            </div>
          </div>
        )}
      </Drawer>
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
