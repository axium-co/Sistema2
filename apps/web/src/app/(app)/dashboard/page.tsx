'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { CalendarDays, AlertTriangle, CheckSquare, Target, ArrowRight, TrendingUp } from 'lucide-react';
import { api, useAuth } from '@/lib/api';
import { PageHeader, StatCard } from '@/components/layout/page-header';
import { Button, Card, EmptyState, Skeleton } from '@/components/ui';
import { brl, formatTime, EVENT_COLORS } from '@/lib/labels';

const EVENT_COLORS_SAFE = EVENT_COLORS;

export default function DashboardPage() {
  const user = useAuth((s) => s.user);
  const { data, isLoading } = useQuery({
    queryKey: ['my-day'],
    queryFn: () => api.get<any>('/api/dashboard/my-day'),
  });
  const { data: funnel } = useQuery({
    queryKey: ['funnel'],
    queryFn: () => api.get<any[]>('/api/dashboard/funnel'),
  });

  const s = data?.summary;
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow={today}
        title={`Olá, ${user?.name?.split(' ')[0] ?? ''}`}
        description="Sua central de comando: o que precisa da sua atenção agora."
        actions={
          <Link href="/agenda?novo=1">
            <Button>
              Novo compromisso <ArrowRight size={15} />
            </Button>
          </Link>
        }
      />

      <div className="space-y-6 px-6 lg:px-8">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Compromissos hoje" value={s?.eventsToday ?? 0} hint="Agenda do dia" accent="info" />
            <StatCard label="Tarefas para hoje" value={s?.tasksToday ?? 0} hint="Com vencimento hoje" />
            <StatCard
              label="Atrasados"
              value={(s?.overdueActivities ?? 0) + (s?.overdueCards ?? 0)}
              hint="Atividades e tarefas vencidas"
              accent={(s?.overdueActivities ?? 0) + (s?.overdueCards ?? 0) > 0 ? 'danger' : undefined}
            />
            <StatCard label="Novos leads" value={s?.newLeads ?? 0} hint="Aguardando contato" accent="warning" />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <StatCard label="Negócios em aberto" value={s?.openDeals ?? 0} hint={`${brl(s?.openDealsValue)} no pipeline`} />
          <StatCard label="Ganho no mês" value={brl(s?.wonThisMonth)} accent="success" />
          <Card className="flex items-center justify-between p-5">
            <div>
              <p className="text-eyebrow uppercase text-faint">Meta do período</p>
              {s?.goal ? (
                <>
                  <p className="mt-2 text-2xl font-extrabold tracking-tight text-fg">
                    {Math.round((s.goal.progress / s.goal.target) * 100)}%
                  </p>
                  <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-success"
                      style={{ width: `${Math.min(100, (s.goal.progress / s.goal.target) * 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-2 text-lg font-semibold text-muted">Sem meta ativa</p>
                  <p className="mt-1 text-xs text-faint">Defina metas para acompanhar o progresso.</p>
                </>
              )}
            </div>
            <TrendingUp className="text-faint" size={22} strokeWidth={1.5} />
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3" glow={false}>
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <CalendarDays size={17} className="text-muted" strokeWidth={1.6} />
                <h3 className="text-sm font-semibold text-fg">Agenda de hoje</h3>
              </div>
              <Link href="/agenda" className="text-xs text-muted hover:text-fg">
                ver agenda
              </Link>
            </div>
            <div className="divide-y divide-white/5">
              {(data?.timeline ?? []).length === 0 && (
                <EmptyState
                  title="Nada agendado para hoje"
                  description="Aproveite para avançar seus negócios em aberto."
                />
              )}
              {(data?.timeline ?? []).map((item: any) => (
                <div key={`${item.kind}-${item.id}`} className="flex items-center gap-4 px-5 py-3">
                  <span
                    className="h-8 w-1 rounded-full"
                    style={{ backgroundColor: item.color ?? EVENT_COLORS_SAFE[item.type] ?? '#71717A' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{item.title}</p>
                    <p className="text-xs text-faint">
                      {item.kind === 'task' ? `Tarefa · ${item.boardName}` : formatTime(item.at)}
                    </p>
                  </div>
                  <span className="text-xs text-muted">{formatTime(item.at)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-2" glow={false}>
            <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
              <AlertTriangle size={17} className="text-warning" strokeWidth={1.6} />
              <h3 className="text-sm font-semibold text-fg">Precisa de atenção</h3>
            </div>
            <div className="divide-y divide-white/5">
              {(data?.overdue?.activities ?? []).length === 0 && (data?.overdue?.cards ?? []).length === 0 && (
                <EmptyState title="Tudo em dia" description="Nenhuma atividade ou tarefa atrasada." />
              )}
              {(data?.overdue?.activities ?? []).slice(0, 5).map((a: any) => (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" strokeWidth={1.8} />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-fg">{a.subject}</p>
                    <p className="text-xs text-faint">
                      {a.deal?.title ?? a.contact?.fullName ?? 'Atividade'} · venceu {formatTime(a.dueAt)}
                    </p>
                  </div>
                </div>
              ))}
              {(data?.overdue?.cards ?? []).slice(0, 5).map((c: any) => (
                <div key={c.id} className="flex items-start gap-3 px-5 py-3">
                  <CheckSquare size={14} className="mt-0.5 shrink-0 text-warning" strokeWidth={1.8} />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-fg">{c.title}</p>
                    <p className="text-xs text-faint">Tarefa atrasada · {c.board?.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card glow={false}>
          <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
            <Target size={17} className="text-muted" strokeWidth={1.6} />
            <h3 className="text-sm font-semibold text-fg">Funil de vendas</h3>
          </div>
          <div className="space-y-4 p-5">
            {(funnel ?? []).map((pipeline: any) => (
              <div key={pipeline.id}>
                <p className="mb-3 text-xs font-medium text-muted">{pipeline.name}</p>
                <div className="space-y-2.5">
                  {pipeline.stages.map((stage: any) => {
                    const total = pipeline.stages.reduce((acc: number, st: any) => acc + st.value, 0) || 1;
                    return (
                      <div key={stage.id} className="flex items-center gap-3">
                        <span className="w-32 shrink-0 truncate text-xs text-muted">{stage.name}</span>
                        <div className="h-6 flex-1 overflow-hidden rounded-md bg-white/5">
                          <div
                            className="flex h-full items-center justify-end rounded-md px-2"
                            style={{
                              width: `${Math.max(6, (stage.value / total) * 100)}%`,
                              backgroundColor: `${stage.color ?? '#71717A'}33`,
                            }}
                          >
                            <span className="text-[11px] font-medium text-fg">{brl(stage.value)}</span>
                          </div>
                        </div>
                        <span className="w-8 shrink-0 text-right text-xs text-faint">{stage.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
