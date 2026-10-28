'use client';

import { useState } from 'react';
import { Kanban, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { ContactsTab } from '@/components/crm/contacts-tab';
import { DealsTab } from '@/components/crm/deals-tab';
import { cn } from '@/lib/utils';

type Tab = 'contatos' | 'negocios';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'contatos', label: 'Contatos', icon: Users },
  { id: 'negocios', label: 'Negócios', icon: Kanban },
];

export default function CrmPage() {
  const [tab, setTab] = useState<Tab>('contatos');

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="CRM"
        title="Contatos, empresas e funil"
        description="Cadastre clientes, acompanhe oportunidades e gerencie o pipeline de vendas."
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

        {tab === 'contatos' && <ContactsTab />}
        {tab === 'negocios' && <DealsTab />}
      </div>
    </div>
  );
}
