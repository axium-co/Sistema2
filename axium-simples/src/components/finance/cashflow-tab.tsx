'use client';

import { useMemo } from 'react';
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useSupabaseQuery, isMissingSchema } from '@/lib/use-supabase-query';
import type { FinanceEntry } from '@/lib/types';
import {
  FINANCE_KIND_COLORS,
  FINANCE_KIND_LABELS,
} from '@/lib/labels';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui';
import { StatCard } from '@/components/layout/page-header';
import { SchemaSetupNotice } from '@/components/layout/db-setup-notice';
import { brl } from '@/lib/utils';
import { lastMonthKeys, monthKey, monthLabel } from '@/lib/finance';

function sumAmounts(entries: FinanceEntry[]) {
  return entries.reduce((total, entry) => total + Number(entry.amount ?? 0), 0);
}

export function FinanceCashflowTab() {
  const supabase = useMemo(() => createClient(), []);

  const { data, error, loading } = useSupabaseQuery<FinanceEntry[]>(async () => {
    const result = await supabase
      .from('finance_entries')
      .select('*, category:finance_categories(*)')
      .eq('status', 'PAGO')
      .not('paid_at', 'is', null)
      .order('paid_at');
    return { data: result.data as FinanceEntry[] | null, error: result.error };
  }, []);

  const view = useMemo(() => {
    const paid = data ?? [];
    const months = lastMonthKeys(6);
    const monthly = months.map((key) => {
      const entries = paid.filter((entry) => entry.paid_at && monthKey(entry.paid_at) === key);
      const income = sumAmounts(entries.filter((entry) => entry.kind === 'RECEITA'));
      const expense = sumAmounts(entries.filter((entry) => entry.kind === 'DESPESA'));
      return { key, income, expense, balance: income - expense };
    });

    const currentKey = months[months.length - 1];
    const current = monthly[monthly.length - 1];
    const accumulated =
      sumAmounts(paid.filter((entry) => entry.kind === 'RECEITA')) -
      sumAmounts(paid.filter((entry) => entry.kind === 'DESPESA'));

    const currentEntries = paid.filter(
      (entry) => entry.paid_at && monthKey(entry.paid_at) === currentKey,
    );
    const categoryMap = new Map<
      string,
      { name: string; color: string; income: number; expense: number }
    >();

    for (const entry of currentEntries) {
      const key = entry.category?.id ?? 'none';
      const currentCategory = categoryMap.get(key) ?? {
        name: entry.category?.name ?? 'Sem categoria',
        color: entry.category?.color ?? '#71717A',
        income: 0,
        expense: 0,
      };
      if (entry.kind === 'RECEITA') currentCategory.income += Number(entry.amount ?? 0);
      else currentCategory.expense += Number(entry.amount ?? 0);
      categoryMap.set(key, currentCategory);
    }

    const categories = Array.from(categoryMap.values()).sort(
      (a, b) =>
        b.income + b.expense - (a.income + a.expense),
    );

    return { months, monthly, current, accumulated, categories };
  }, [data]);

  if (error && isMissingSchema(error)) {
    return <SchemaSetupNotice error={error} />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">
        Não foi possível carregar o fluxo de caixa: {error.message}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Entradas no mês"
          value={brl(view.current?.income ?? 0)}
          accent="success"
        />
        <StatCard
          label="Saídas no mês"
          value={brl(view.current?.expense ?? 0)}
          accent="danger"
        />
        <StatCard
          label="Saldo do mês"
          value={brl(view.current?.balance ?? 0)}
          accent={(view.current?.balance ?? 0) >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          label="Saldo acumulado"
          value={brl(view.accumulated)}
          hint="Todos os lançamentos pagos"
          accent={view.accumulated >= 0 ? 'success' : 'danger'}
        />
      </div>

      <Card glow={false}>
        <CardHeader
          title="Fluxo dos últimos 6 meses"
          subtitle="Baseado na data de pagamento dos lançamentos."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-eyebrow uppercase text-faint">
                <th className="px-5 py-3 font-medium">Mês</th>
                <th className="px-5 py-3 font-medium">Entradas</th>
                <th className="px-5 py-3 font-medium">Saídas</th>
                <th className="px-5 py-3 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {view.monthly.map((month) => (
                <tr key={month.key} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3 capitalize text-fg">{monthLabel(month.key)}</td>
                  <td className="px-5 py-3" style={{ color: FINANCE_KIND_COLORS.RECEITA }}>
                    <span className="inline-flex items-center gap-1.5">
                      <TrendingUp size={13} /> {brl(month.income)}
                    </span>
                  </td>
                  <td className="px-5 py-3" style={{ color: FINANCE_KIND_COLORS.DESPESA }}>
                    <span className="inline-flex items-center gap-1.5">
                      <TrendingDown size={13} /> {brl(month.expense)}
                    </span>
                  </td>
                  <td
                    className={
                      month.balance >= 0
                        ? 'px-5 py-3 font-medium text-success'
                        : 'px-5 py-3 font-medium text-danger'
                    }
                  >
                    {brl(month.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card glow={false}>
        <CardHeader
          title="Categorias do mês"
          subtitle={`Entradas e saídas pagas em ${monthLabel(view.months[view.months.length - 1])}.`}
        />
        {view.categories.length === 0 ? (
          <EmptyState
            icon={<Wallet size={18} strokeWidth={1.6} />}
            title="Nenhum lançamento pago neste mês"
            description="Marque contas como pagas para alimentar o fluxo de caixa."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-eyebrow uppercase text-faint">
                  <th className="px-5 py-3 font-medium">Categoria</th>
                  <th className="px-5 py-3 font-medium">Entradas</th>
                  <th className="px-5 py-3 font-medium">Saídas</th>
                  <th className="px-5 py-3 font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {view.categories.map((category) => {
                  const balance = category.income - category.expense;
                  return (
                    <tr key={category.name} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3 text-fg">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          {category.name}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {category.income > 0 ? brl(category.income) : '—'}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {category.expense > 0 ? brl(category.expense) : '—'}
                      </td>
                      <td
                        className={
                          balance >= 0
                            ? 'px-5 py-3 text-xs font-medium text-success'
                            : 'px-5 py-3 text-xs font-medium text-danger'
                        }
                      >
                        {brl(balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="px-1 text-[11px] text-faint">
        {FINANCE_KIND_LABELS.RECEITA} e {FINANCE_KIND_LABELS.DESPESA} consideram apenas
        lançamentos com status pago.
      </p>
    </div>
  );
}
