'use client';

import { useState } from 'react';
import { Tags, TrendingUp, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { FinanceEntriesTab } from '@/components/finance/entries-tab';
import { FinanceCashflowTab } from '@/components/finance/cashflow-tab';
import { FinanceCategoriesTab } from '@/components/finance/categories-tab';
import { cn } from '@/lib/utils';

type Tab = 'lancamentos' | 'fluxo' | 'categorias';

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'lancamentos', label: 'Lançamentos', icon: Wallet },
  { id: 'fluxo', label: 'Fluxo de caixa', icon: TrendingUp },
  { id: 'categorias', label: 'Categorias', icon: Tags },
];

export default function FinanceiroPage() {
  const [tab, setTab] = useState<Tab>('lancamentos');

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Financeiro"
        title="Contas e fluxo de caixa"
        description="Acompanhe contas a pagar, a receber e o saldo realizado."
      />

      <div className="px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap gap-1 rounded-full border border-white/10 bg-surface p-1">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-colors',
                  tab === item.id
                    ? 'bg-elevated text-fg'
                    : 'text-muted-foreground hover:text-fg',
                )}
              >
                <Icon size={14} strokeWidth={1.8} />
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === 'lancamentos' && <FinanceEntriesTab />}
        {tab === 'fluxo' && <FinanceCashflowTab />}
        {tab === 'categorias' && <FinanceCategoriesTab />}
      </div>
    </div>
  );
}
