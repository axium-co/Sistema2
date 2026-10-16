'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Target } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Skeleton } from '@/components/ui';

export default function PipelinesPage() {
  const qc = useQueryClient();
  const [newPipeline, setNewPipeline] = useState<string | null>(null);
  const [newStage, setNewStage] = useState<{ pipelineId: string; name: string; color: string } | null>(null);

  const { data: pipelines, isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => api.get<any[]>('/api/deals/pipelines'),
  });

  const createPipeline = useMutation({
    mutationFn: (name: string) => api.post('/api/deals/pipelines', { name }),
    onSuccess: () => {
      toast.success('Funil criado');
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      setNewPipeline(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createStage = useMutation({
    mutationFn: (s: { pipelineId: string; name: string; color: string }) =>
      api.post(`/api/deals/pipelines/${s.pipelineId}/stages`, { name: s.name, color: s.color }),
    onSuccess: () => {
      toast.success('Etapa adicionada');
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      setNewStage(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Configuração de vendas"
        title="Funil de vendas"
        description="Defina as etapas que seus negócios percorrem até o fechamento."
        actions={
          <Button onClick={() => setNewPipeline('')}>
            <Plus size={15} /> Novo funil
          </Button>
        }
      />

      <div className="space-y-6 px-6 lg:px-8">
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : (pipelines ?? []).length === 0 ? (
          <Card glow={false}>
            <EmptyState icon={<Target size={20} />} title="Nenhum funil" action={<Button onClick={() => setNewPipeline('')}>Criar funil</Button>} />
          </Card>
        ) : (
          pipelines!.map((p) => (
            <Card key={p.id} glow={false}>
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Target size={17} className="text-muted" strokeWidth={1.6} />
                  <h3 className="text-sm font-semibold text-fg">{p.name}</h3>
                  {p.isDefault && <Badge>padrão</Badge>}
                </div>
                <Button size="sm" variant="secondary" onClick={() => setNewStage({ pipelineId: p.id, name: '', color: '#7C9CBF' })}>
                  <Plus size={13} /> Etapa
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 p-5">
                {p.stages.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-full border border-white/10 bg-elevated px-3 py-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-xs text-fg">{s.name}</span>
                    <span className="text-[11px] text-faint">{s.probability}%</span>
                  </div>
                ))}
                {p.stages.length === 0 && <p className="text-xs text-faint">Nenhuma etapa. Adicione a primeira.</p>}
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal open={newPipeline !== null} onClose={() => setNewPipeline(null)} title="Novo funil">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newPipeline) createPipeline.mutate(newPipeline);
          }}
          className="space-y-4"
        >
          <Field label="Nome do funil">
            <Input autoFocus required value={newPipeline ?? ''} onChange={(e) => setNewPipeline(e.target.value)} placeholder="Ex.: Vendas consultivas" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setNewPipeline(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createPipeline.isPending}>
              Criar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!newStage} onClose={() => setNewStage(null)} title="Nova etapa">
        {newStage && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createStage.mutate(newStage);
            }}
            className="space-y-4"
          >
            <Field label="Nome da etapa">
              <Input autoFocus required value={newStage.name} onChange={(e) => setNewStage({ ...newStage, name: e.target.value })} />
            </Field>
            <Field label="Cor">
              <input
                type="color"
                value={newStage.color}
                onChange={(e) => setNewStage({ ...newStage, color: e.target.value })}
                className="h-10 w-20 cursor-pointer rounded-lg border border-white/10 bg-surface"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNewStage(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createStage.isPending}>
                Adicionar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
