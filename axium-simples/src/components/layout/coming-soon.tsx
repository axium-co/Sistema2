import { Card, CardHeader, EmptyState } from '@/components/ui';
import { PageHeader } from './page-header';

export function ComingSoon({
  eyebrow,
  title,
  description,
  stage,
}: {
  eyebrow: string;
  title: string;
  description: string;
  stage: string;
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="px-6 pb-8 lg:px-8">
        <Card>
          <CardHeader title="Módulo em construção" subtitle={`Previsto: ${stage}`} />
          <EmptyState
            icon={<span className="text-lg">◷</span>}
            title="Nada por aqui ainda"
            description="Este módulo entra na próxima etapa do plano. A estrutura de telas, rotas e navegação já está pronta."
          />
        </Card>
      </div>
    </>
  );
}
