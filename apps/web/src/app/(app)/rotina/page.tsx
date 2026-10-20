'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Circle,
  Clock,
  Plus,
  Target,
  Timer,
  X,
  Flame,
  AlarmClock,
  PlayCircle,
  StopCircle,
  CircleDot,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { addDays, format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Button, Card, EmptyState, Field, Input, Modal, Select, Skeleton } from '@/components/ui';
import {
  ROUTINE_FREQUENCY_LABELS,
  ROUTINE_FREQUENCIES,
  WEEKDAYS,
  WEEKDAY_LABELS,
  TIME_BLOCK_COLORS,
  DEFAULT_TIME_BLOCK_COLOR,
  FOCUS_DEFAULT_MINUTES,
  FOCUS_MAX_MINUTES,
} from '@/lib/labels';

const toDateStr = (d: Date) => format(d, 'yyyy-MM-dd');

function CheckBox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
        checked ? 'border-success/40 bg-success/20 text-success' : 'border-white/15 text-transparent hover:text-white/40'
      }`}
    >
      {checked && <Check size={13} />}
    </button>
  );
}

export default function RotinaPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'hoje' | 'rotinas' | 'habitos' | 'foco' | 'desempenho'>('hoje');
  const [date, setDate] = useState(() => new Date());

  // Hoje
  const { data: plan, isLoading: loadingPlan } = useQuery({
    queryKey: ['routine-plan', toDateStr(date)],
    queryFn: () => api.get<any>(`/api/routines/plan?date=${toDateStr(date)}`),
  });

  const toggleRun = useMutation({
    mutationFn: ({ runId, itemId, checked }: { runId: string; itemId: string; checked: boolean }) =>
      api.patch(`/api/routines/runs/${runId}/items/${itemId}`, { checked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routine-plan', toDateStr(date)] }),
    onError: (e: any) => toast.error(e.message),
  });

  const completeRun = useMutation({
    mutationFn: (runId: string) => api.post(`/api/routines/runs/${runId}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routine-plan', toDateStr(date)] }),
    onError: (e: any) => toast.error(e.message),
  });

  // Rotinas
  const { data: routines, isLoading: loadingRoutines } = useQuery({
    queryKey: ['routines'],
    queryFn: () => api.get<any[]>('/api/routines'),
  });

  const [routineForm, setRoutineForm] = useState<any>(null);

  const createRoutine = useMutation({
    mutationFn: (payload: any) => api.post('/api/routines', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: ['routine-plan', toDateStr(date)] });
      setRoutineForm(null);
      toast.success('Rotina criada');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Habitos
  const { data: habits, isLoading: loadingHabits } = useQuery({
    queryKey: ['habits'],
    queryFn: () => api.get<any[]>('/api/routines/habits'),
  });

  const [habitForm, setHabitForm] = useState<any>(null);

  const createHabit = useMutation({
    mutationFn: (payload: any) => api.post('/api/routines/habits', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] });
      qc.invalidateQueries({ queryKey: ['routine-plan', toDateStr(date)] });
      setHabitForm(null);
      toast.success('Habito criado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleHabitLog = useMutation({
    mutationFn: (id: string) => api.post(`/api/routines/habits/${id}/logs`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['habits'] });
      qc.invalidateQueries({ queryKey: ['routine-plan', toDateStr(date)] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Foco
  const { data: currentFocus } = useQuery({
    queryKey: ['focus-current'],
    queryFn: () => api.get<any>(`/api/routines/focus/current`),
    refetchInterval: 15_000,
  });

  const { data: focusStats } = useQuery({
    queryKey: ['focus-stats'],
    queryFn: () => api.get<any>(`/api/routines/focus/stats`),
    refetchInterval: 30_000,
  });

  const startFocus = useMutation({
    mutationFn: () => api.post('/api/routines/focus/start', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['focus-current'] }),
  });

  const stopFocus = useMutation({
    mutationFn: (id: string) => api.post(`/api/routines/focus/${id}/stop`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['focus-current'] });
      qc.invalidateQueries({ queryKey: ['focus-stats'] });
    },
  });

  const { data: routineStats } = useQuery({
    queryKey: ['routine-stats'],
    queryFn: () => api.get<any>(`/api/routines/stats?days=30`),
    enabled: tab === 'desempenho',
  });

  const [routineItems, setRoutineItems] = useState<string[]>(['']);
  const [routineWeekdays, setRoutineWeekdays] = useState<string[]>([]);

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Organizacao"
        title="Rotina"
        description="Planeje seu dia, execute seus checklists e mantenha seus habitos."
        actions={
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-elevated p-1">
            {[
              { id: 'hoje', label: 'Hoje' },
              { id: 'rotinas', label: 'Rotinas' },
              { id: 'habitos', label: 'Habitos' },
              { id: 'foco', label: 'Foco' },
              { id: 'desempenho', label: 'Desempenho' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.id ? 'bg-white/5 text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="px-6 lg:px-8 space-y-6">
        {tab === 'hoje' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button className="rounded-full p-1.5 border border-white/10" onClick={() => setDate(subDays(date, 1))}>
                  <X size={14} style={{ transform: 'rotate(180deg)' }} />
                </button>
                <span className="text-sm font-medium">{format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
                <button className="rounded-full p-1.5 border border-white/10" onClick={() => setDate(addDays(date, 1))}>
                  <X size={14} />
                </button>
                {format(new Date(), 'yyyy-MM-dd') === toDateStr(date) && (
                  <span className="text-[11px] uppercase tracking-wide text-faint">Hoje</span>
                )}
              </div>
            </div>

            {loadingPlan ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-40" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Checklists do dia</p>
                    <Check size={15} className="text-muted" />
                  </div>
                  {plan?.routines?.length ? (
                    <div className="space-y-3">
                      {plan.routines.map((run: any) => (
                        <div key={run.id} className="rounded-2xl border border-white/5 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm">{run.name}</span>
                            <span className="text-[11px] text-faint">
                              {run.checked}/{run.total}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {run.items.map((item: any) => (
                              <div key={item.id} className="flex items-start gap-2">
                                <CheckBox
                                  checked={item.checked}
                                  onToggle={() => toggleRun.mutate({ runId: run.id, itemId: item.id, checked: !item.checked })}
                                />
                                <span className={`text-sm ${item.checked ? 'line-through text-faint' : ''}`}>{item.title}</span>
                              </div>
                            ))}
                          </div>
                          {run.status !== 'DONE' && run.total > 0 && (
                            <div className="mt-3 flex justify-end">
                              <Button size="sm" variant="secondary" onClick={() => completeRun.mutate(run.id)}>
                                Marcar tudo concluido
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Sem rotinas para hoje" description="Crie ou adicione uma rotina para este dia" />
                  )}
                </Card>

                <Card className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Habitos</p>
                    <Flame size={15} className="text-muted" />
                  </div>
                  {plan?.habits?.length ? (
                    <div className="space-y-2">
                      {plan.habits.map((h: any) => (
                        <div key={h.id} className="flex items-center justify-between rounded-2xl border border-white/5 px-3 py-2">
                          <div>
                            <p className="text-sm">{h.name}</p>
                            <p className="text-[11px] text-faint">Sequencia: {h.streak} • Esta semana: {h.weekCount}/{h.targetPerWeek}</p>
                          </div>
                          <CheckBox checked={h.doneToday} onToggle={() => toggleHabitLog.mutate(h.id)} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Nenhum habito" description="Adicione um habito na aba Habitos" />
                  )}
                </Card>

                <Card className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Tarefas com vencimento hoje</p>
                    <CircleDot size={15} className="text-muted" />
                  </div>
                  {plan?.cards?.length ? (
                    <div className="space-y-2">
                      {plan.cards.map((c: any) => (
                        <div key={c.id} className="rounded-2xl border border-white/5 px-3 py-2 text-sm">
                          {c.title}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Nenhuma tarefa vence hoje" description="Tudo em dia por aqui" />
                  )}
                </Card>

                <Card className="p-5 md:col-span-2 lg:col-span-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Blocos de tempo</p>
                    <Clock size={15} className="text-muted" />
                  </div>
                  {plan?.timeBlocks?.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {plan.timeBlocks.map((b: any) => (
                        <div key={b.id} className="flex items-start gap-3 rounded-2xl border border-white/5 p-3">
                          <div className="h-2.5 w-2.5 mt-1.5 rounded-full" style={{ backgroundColor: b.color }} />
                          <div>
                            <p className="text-sm">{b.title}</p>
                            <p className="text-[11px] text-faint">
                              {String(Math.floor(b.startMin/60)).padStart(2,'0')}:{String(b.startMin%60).padStart(2,'0')} - 
                              {String(Math.floor(b.endMin/60)).padStart(2,'0')}:{String(b.endMin%60).padStart(2,'0')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Sem blocos de tempo" description="Organize seu dia com blocos" />
                  )}
                </Card>
              </div>
            )}
          </div>
        )}

        {tab === 'rotinas' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Minhas rotinas</p>
              <Button size="sm" onClick={() => setRoutineForm({ frequency: 'DAILY', items: [''], weekdays: [] })}>
                <Plus size={13} /> Nova rotina
              </Button>
            </div>
            {loadingRoutines ? (
              <Skeleton className="h-32" />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {routines?.map((r: any) => (
                  <Card key={r.id} className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold">{r.name}</p>
                        <p className="text-[11px] text-faint uppercase tracking-wide">
                          {ROUTINE_FREQUENCY_LABELS[r.frequency as keyof typeof ROUTINE_FREQUENCY_LABELS] ?? r.frequency}
                          {r.isTemplate && ' • Modelo compartilhado'}
                        </p>
                      </div>
                    </div>
                    {r.items?.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {r.items.map((it: any) => (
                          <p key={it.id} className="text-xs text-muted flex items-center gap-2">
                            <Circle size={8} /> {it.title}
                          </p>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
                {routines?.length === 0 && (
                  <Card className="col-span-full p-8">
                    <EmptyState title="Nenhuma rotina" description="Crie uma rotina para gerar seus checklists diarios" />
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'habitos' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Habitos</p>
              <Button size="sm" onClick={() => setHabitForm({ targetPerWeek: 5, color: '#8FBF9F' })}>
                <Plus size={13} /> Novo habito
              </Button>
            </div>
            {loadingHabits ? (
              <Skeleton className="h-24" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {habits?.map((h: any) => (
                  <Card key={h.id} className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold">{h.name}</p>
                        <p className="text-[11px] text-faint">Streak: {h.streak} | Semana: {h.weekCount}/{h.targetPerWeek}</p>
                      </div>
                      <CheckBox checked={h.doneToday} onToggle={() => toggleHabitLog.mutate(h.id)} />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'foco' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <Timer size={32} className="text-muted" />
                <div>
                  <p className="text-sm font-semibold">Sessao de foco</p>
                  <p className="text-[11px] text-faint">Tempo concentrado em blocos</p>
                </div>
                {currentFocus ? (
                  <div className="space-y-2">
                    <p className="text-3xl font-extrabold tracking-tight">{currentFocus.label ?? 'Foco'}</p>
                    <Button size="lg" variant="danger" onClick={() => stopFocus.mutate(currentFocus.id)}>
                      <StopCircle size={16} /> Encerar sessao
                    </Button>
                  </div>
                ) : (
                  <Button size="lg" onClick={() => startFocus.mutate()}>
                    <PlayCircle size={16} /> Iniciar foco
                  </Button>
                )}
              </div>
            </Card>
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold">Estatisticas</p>
                <AlarmClock size={15} className="text-muted" />
              </div>
              {focusStats && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/5 p-3">
                    <p className="text-[11px] text-faint">Hoje</p>
                    <p className="text-lg font-semibold">{focusStats.todayMinutes} min • {focusStats.todaySessions} sessoes</p>
                  </div>
                  <div className="rounded-2xl border border-white/5 p-3">
                    <p className="text-[11px] text-faint">Esta semana</p>
                    <p className="text-lg font-semibold">{focusStats.weekMinutes} min • {focusStats.weekSessions} sessoes</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {tab === 'desempenho' && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-5">
                <p className="text-[11px] uppercase tracking-wide text-faint">Adesão (30 dias)</p>
                <p className="mt-1 text-2xl font-semibold">
                  {routineStats ? `${Math.round(routineStats.overall.rate * 100)}%` : '—'}
                </p>
                <p className="text-[11px] text-faint">
                  {routineStats ? `${routineStats.overall.done}/${routineStats.overall.total} execuções` : ''}
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-[11px] uppercase tracking-wide text-faint">Sequência atual</p>
                <p className="mt-1 flex items-center gap-2 text-2xl font-semibold">
                  <Flame size={18} className="text-warning" /> {routineStats?.overall.streak ?? 0}
                </p>
                <p className="text-[11px] text-faint">dias seguidos 100% concluídos</p>
              </Card>
              <Card className="p-5">
                <p className="text-[11px] uppercase tracking-wide text-faint">Rotinas ativas</p>
                <p className="mt-1 text-2xl font-semibold">{routineStats?.routines?.length ?? 0}</p>
                <p className="text-[11px] text-faint">com execuções no período</p>
              </Card>
            </div>

            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold">Conclusão diária</p>
                <TrendingUp size={15} className="text-muted" />
              </div>
              {!routineStats ? (
                <Skeleton className="h-24" />
              ) : (
                <div className="flex h-28 items-end gap-1">
                  {routineStats.daily.map((d: any) => {
                    const pct = d.total ? d.done / d.total : 0;
                    return (
                      <div key={d.date} className="group relative flex-1" title={`${d.date}: ${d.done}/${d.total}`}>
                        <div className="w-full rounded-sm bg-white/5" style={{ height: 96 }}>
                          <div
                            className="w-full rounded-sm bg-success/70 transition-all group-hover:bg-success"
                            style={{ height: `${Math.max(pct * 96, d.total ? 4 : 0)}px`, marginTop: 96 - Math.max(pct * 96, d.total ? 4 : 0) }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="divide-y divide-white/5">
              {routineStats?.routines?.length ? (
                routineStats.routines.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between px-6 py-3.5">
                    <div>
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-[11px] text-faint">
                        {ROUTINE_FREQUENCY_LABELS[r.frequency as keyof typeof ROUTINE_FREQUENCY_LABELS] ?? r.frequency} •{' '}
                        {Math.round(r.rate * 100)}% ({r.done}/{r.total})
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted">
                      <Flame size={14} className="text-warning" /> {r.streak}
                      <span className="text-faint">/ melhor {r.bestStreak}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="Sem dados ainda" description="Conclua rotinas para ver suas estatísticas" />
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
