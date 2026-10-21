import { Card, CardHeader, EmptyState } from '@/components/ui';
import { PageHeader, StatCard } from '@/components/layout/page-header';

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Painel"
        title="Meu dia"
        description="Tarefas de hoje, compromissos, follow-ups atrasados e resumo do funil."
      />

      <div className="space-y-6 px-6 pb-8 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Compromissos hoje" value="—" hint="Etapa 5" />
          <StatCard label="Tarefas de hoje" value="—" hint="Etapa 4" accent="info" />
          <StatCard label="Atrasados" value="—" hint="Etapa 7" accent="warning" />
          <StatCard label="Negócios em aberto" value="—" hint="Etapa 3" accent="success" />
        </div>

        <Card>
          <CardHeader
            title="Resumo do dia"
            subtitle="Os dados reais entram na Etapa 7 (Dashboard “Meu Dia”)"
          />
          <EmptyState
            title="Base pronta"
            description="Login, tema, navegação e proteção de rotas já funcionam. A Etapa 2 (banco + RLS) habilita os dados reais."
          />
        </Card>
      </div>
    </>
  );
}
