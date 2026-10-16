'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, KanbanSquare, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Button, Card, EmptyState, Field, Input, Modal, Select, Skeleton } from '@/components/ui';
import { formatDate } from '@/lib/labels';

export default function TarefasPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState<{ name: string; visibility: string } | null>(null);

  const { data: boards, isLoading } = useQuery({
    queryKey: ['boards'],
    queryFn: () => api.get<any[]>('/api/boards'),
  });

  const create = useMutation({
    mutationFn: (payload: any) => api.post('/api/boards', payload),
    onSuccess: () => {
      toast.success('Quadro criado');
      qc.invalidateQueries({ queryKey: ['boards'] });
      setCreating(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Organização"
        title="Tarefas"
        description="Quadros kanban para organizar o trabalho da equipe."
        actions={
          <Button onClick={() => setCreating({ name: '', visibility: 'TENANT' })}>
            <Plus size={15} /> Novo quadro
          </Button>
        }
      />

      <div className="px-6 lg:px-8">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : (boards ?? []).length === 0 ? (
          <Card glow={false}>
            <EmptyState
              icon={<KanbanSquare size={20} />}
              title="Nenhum quadro"
              description="Crie um quadro para começar a organizar as tarefas."
              action={<Button onClick={() => setCreating({ name: '', visibility: 'TENANT' })}>Novo quadro</Button>}
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards!.map((b) => (
              <Link key={b.id} href={`/tarefas/${b.id}`}>
                <Card className="h-full transition-colors hover:border-white/20">
                  <div className="p-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-elevated">
                      <KanbanSquare size={17} className="text-muted" strokeWidth={1.6} />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-fg">{b.name}</p>
                    <p className="mt-0.5 text-xs text-faint">Criado em {formatDate(b.createdAt)}</p>
                    <div className="mt-4 flex gap-4 text-xs text-muted">
                      <span className="flex items-center gap-1.5">
                        <ListChecks size={13} /> {b._count?.cards ?? 0} tarefas
                      </span>
                      <span>{b._count?.lists ?? 0} listas</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!creating} onClose={() => setCreating(null)} title="Novo quadro">
        {creating && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(creating);
            }}
            className="space-y-4"
          >
            <Field label="Nome do quadro">
              <Input autoFocus required value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} placeholder="Ex.: Prospecção ativa" />
            </Field>
            <Field label="Visibilidade">
              <Select value={creating.visibility} onChange={(e) => setCreating({ ...creating, visibility: e.target.value })}>
                <option value="TENANT">Toda a empresa</option>
                <option value="TEAM">Somente equipe</option>
                <option value="PRIVATE">Privado</option>
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreating(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending}>
                Criar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
