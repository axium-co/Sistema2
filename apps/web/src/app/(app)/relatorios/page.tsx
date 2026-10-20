'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui';
import { ACTIVITY_LABELS } from '@/lib/labels';
import { brl, cn } from '@/lib/utils';

const PERIODS = [
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 180, label: '6 meses' },
  { days: 365, label: '12 meses' },
];

interface Reports {
  period: { days: number; from: string; to: string };
  summary: {
    wonCount: number;
    wonValue: number;
    lostCount: number;
    lostValue: number;
    openCount: number;
    openValue: number;
    createdCount: number;
    createdValue: number;
    conversionRate: number;
    avgCycleDays: number;
    newLeads: number;
    activitiesCount: number;
  };
  byMember: { userId: string; name: string; openCount: number; openValue: number; wonCount: number; wonValue: number; lostCount: number }[];
  monthly: { month: string; createdCount: number; createdValue: number; wonCount: number; wonValue: number }[];
  byStage: { id: string; name: string; color: string; count: number; value: number }[];
  byActivityType: { type: string; count: number }[];
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-eyebrow uppercase text-faint">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-fg">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

function monthLabel(month: string) {
  const [year, m] = month.split('-');
  return `${m}/${year.slice(2)}`;
}

export default function RelatoriosPage() {
  const [days, setDays] = useState(90);
  const { data, isLoading } = useQuery({
    queryKey: ['reports', days],
    queryFn: () => api.get<Reports>(`/api/dashboard/reports?days=${days}`),
    placeholderData: keepPreviousData,
  });

  const maxMonthValue = Math.max(1, ...(data?.monthly ?? []).flatMap((m) => [m.createdValue, m.wonValue]));
  const maxStageCount = Math.max(1, ...(data?.byStage ?? []).map((s) => s.count));

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Análise"
        title="Relatórios"
        description="Desempenho comercial, funil e produtividade no período."
        actions={
          <div className="flex rounded-full border border-white/10 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors',
                  days === p.days ? 'bg-white/10 text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="space-y-6 px-6 lg:px-8">
        {isLoading && !data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : !data ? (
          <Card>
            <EmptyState title="Sem dados" description="Não foi possível carregar os relatórios." />
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Ganhos" value={brl(data.summary.wonValue)} hint={`${data.summary.wonCount} negócio(s)`} />
              <Stat label="Perdidos" value={brl(data.summary.lostValue)} hint={`${data.summary.lostCount} negócio(s)`} />
              <Stat label="Em aberto" value={brl(data.summary.openValue)} hint={`${data.summary.openCount} negócio(s)`} />
              <Stat
                label="Conversão"
                value={`${Math.round(data.summary.conversionRate * 100)}%`}
                hint={`ciclo médio ${data.summary.avgCycleDays} dia(s)`}
              />
              <Stat label="Criados no período" value={brl(data.summary.createdValue)} hint={`${data.summary.createdCount} negócio(s)`} />
              <Stat label="Novos leads" value={String(data.summary.newLeads)} hint="no período" />
              <Stat label="Atividades" value={String(data.summary.activitiesCount)} hint="registradas no período" />
              <Stat label="Ticket médio (ganhos)" value={brl(data.summary.wonCount ? data.summary.wonValue / data.summary.wonCount : 0)} />
            </div>

            <Card>
              <CardHeader
                title="Evolução mensal"
                subtitle="Valor de negócios criados × ganhos por mês"
                action={
                  <div className="flex items-center gap-3 text-[11px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-white/20" /> criados
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-fg/70" /> ganhos
                    </span>
                  </div>
                }
              />
              <div className="flex items-end gap-3 overflow-x-auto px-6 py-6">
                {data.monthly.map((m) => (
                  <div key={m.month} className="flex min-w-[42px] flex-1 flex-col items-center gap-2">
                    <div className="flex h-36 w-full items-end justify-center gap-1">
                      <div
                        className="w-1/3 rounded-t bg-white/20"
                        style={{ height: `${Math.round((m.createdValue / maxMonthValue) * 100)}%` }}
                        title={`Criados: ${brl(m.createdValue)} (${m.createdCount})`}
                      />
                      <div
                        className="w-1/3 rounded-t bg-fg/70"
                        style={{ height: `${Math.round((m.wonValue / maxMonthValue) * 100)}%` }}
                        title={`Ganhos: ${brl(m.wonValue)} (${m.wonCount})`}
                      />
                    </div>
                    <span className="text-[11px] text-faint">{monthLabel(m.month)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Funil em aberto" subtitle="Negócios abertos por etapa" />
                <div className="space-y-4 px-6 py-5">
                  {data.byStage.length === 0 && <p className="text-xs text-muted">Nenhuma etapa configurada.</p>}
                  {data.byStage.map((s) => (
                    <div key={s.id}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-fg">{s.name}</span>
                        <span className="text-muted">
                          {s.count} · {brl(s.value)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.round((s.count / maxStageCount) * 100)}%`, backgroundColor: s.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader title="Atividades por tipo" subtitle="No período selecionado" />
                <div className="flex flex-wrap gap-2 px-6 py-5">
                  {data.byActivityType.length === 0 && <p className="text-xs text-muted">Nenhuma atividade no período.</p>}
                  {data.byActivityType.map((a) => (
                    <span key={a.type} className="rounded-full border border-white/10 bg-elevated px-3 py-1.5 text-xs text-fg">
                      {ACTIVITY_LABELS[a.type as keyof typeof ACTIVITY_LABELS] ?? a.type}
                      <span className="ml-2 font-semibold">{a.count}</span>
                    </span>
                  ))}
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader title="Desempenho por membro" subtitle="Ganhos, perdidos e carteira em aberto" />
              <div className="overflow-x-auto px-6 py-4">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-eyebrow uppercase text-faint">
                      <th className="py-2 pr-4 font-semibold">Membro</th>
                      <th className="py-2 pr-4 font-semibold">Em aberto</th>
                      <th className="py-2 pr-4 font-semibold">Ganhos</th>
                      <th className="py-2 pr-4 font-semibold">Perdidos</th>
                      <th className="py-2 font-semibold">Valor ganho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byMember.map((m) => (
                      <tr key={m.userId} className="border-t border-white/5 text-fg">
                        <td className="py-2.5 pr-4">{m.name}</td>
                        <td className="py-2.5 pr-4 text-muted">
                          {m.openCount} · {brl(m.openValue)}
                        </td>
                        <td className="py-2.5 pr-4 text-muted">{m.wonCount}</td>
                        <td className="py-2.5 pr-4 text-muted">{m.lostCount}</td>
                        <td className="py-2.5 font-semibold">{brl(m.wonValue)}</td>
                      </tr>
                    ))}
                    {data.byMember.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted">
                          Sem negócios no período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {data.summary.openCount === 0 && data.summary.wonCount === 0 && (
              <Card>
                <EmptyState
                  icon={<BarChart3 size={18} />}
                  title="Ainda sem movimentação"
                  description="Crie negócios e registre atividades para acompanhar os indicadores."
                />
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
