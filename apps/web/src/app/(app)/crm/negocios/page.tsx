'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { Plus, Building2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Button, Card, EmptyState, Field, Input, Modal, Skeleton } from '@/components/ui';
import { DEAL_STATUS_LABELS, brl } from '@/lib/labels';
import { DealDrawer } from '@/components/crm/deal-drawer';
import { cn } from '@/lib/utils';

interface Deal {
  id: string;
  title: string;
  amount: number | string;
  status: string;
  stageId: string;
  company?: { id: string; name: string } | null;
  primaryContact?: { id: string; fullName: string } | null;
  owner?: { id: string; name: string } | null;
}

function DealCard({ deal, onOpen }: { deal: Deal; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group rounded-2xl border border-white/10 bg-elevated p-3 transition-colors hover:border-white/20',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          {...listeners}
          {...attributes}
          className="mt-0.5 cursor-grab text-faint opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Arrastar"
        >
          <GripVertical size={14} />
        </button>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="line-clamp-2 text-sm font-medium text-fg">{deal.title}</p>
          {deal.company && (
            <p className="mt-1 flex items-center gap-1 text-xs text-faint">
              <Building2 size={11} /> {deal.company.name}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-success">{brl(deal.amount)}</span>
            {deal.owner && <span className="text-[11px] text-faint">{deal.owner.name.split(' ')[0]}</span>}
          </div>
        </button>
      </div>
    </div>
  );
}

function Column({ stage, deals, onOpen }: { stage: any; deals: Deal[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((acc, d) => acc + Number(d.amount ?? 0), 0);
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
          <span className="text-sm font-semibold text-fg">{stage.name}</span>
          <span className="text-xs text-faint">({deals.length})</span>
        </div>
        <span className="text-[11px] text-faint">{brl(total)}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2 rounded-2xl border border-dashed p-2 transition-colors',
          isOver ? 'border-white/25 bg-white/5' : 'border-white/5',
        )}
      >
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} onOpen={() => onOpen(d.id)} />
        ))}
        {deals.length === 0 && <p className="px-2 py-6 text-center text-xs text-faint">Sem negócios</p>}
      </div>
    </div>
  );
}

export default function NegociosPage() {
  const qc = useQueryClient();
  const [pipelineId, setPipelineId] = useState<string | undefined>();
  const [openDeal, setOpenDeal] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState<any | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: pipelines } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => api.get<any[]>('/api/deals/pipelines'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['deals-board', pipelineId],
    queryFn: () => api.get<{ pipeline: any; deals: Deal[] }>(`/api/deals/board${pipelineId ? `?pipelineId=${pipelineId}` : ''}`),
  });

  const { data: companies } = useQuery({
    queryKey: ['companies-min'],
    queryFn: () => api.get<{ items: any[] }>('/api/crm/companies?pageSize=100'),
  });
  const { data: contacts } = useQuery({
    queryKey: ['contacts-min'],
    queryFn: () => api.get<{ items: any[] }>('/api/crm/contacts?pageSize=100'),
  });
  const { data: users } = useQuery({
    queryKey: ['users-min'],
    queryFn: () => api.get<any[]>('/api/users'),
    retry: false,
  });

  const move = useMutation({
    mutationFn: ({ id, stageId }: { id: string; stageId: string }) => api.patch(`/api/deals/${id}/move`, { stageId, status: 'ABERTO' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals-board'] }),
    onError: (e: any) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: (payload: any) => api.post('/api/deals', payload),
    onSuccess: () => {
      toast.success('Negócio criado');
      qc.invalidateQueries({ queryKey: ['deals-board'] });
      setCreating(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pipeline = data?.pipeline;
  const deals = data?.deals ?? [];

  function onDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id as string | undefined;
    if (!overId || !pipeline) return;
    const deal = deals.find((d) => d.id === e.active.id);
    if (!deal || deal.stageId === overId) return;
    qc.setQueryData<{ pipeline: any; deals: Deal[] }>(['deals-board', pipelineId], (old) =>
      old ? { ...old, deals: old.deals.map((d) => (d.id === deal.id ? { ...d, stageId: overId } : d)) } : old,
    );
    move.mutate({ id: deal.id, stageId: overId });
  }

  const activeDeal = deals.find((d) => d.id === activeId);

  return (
    <div className="flex h-full flex-col pb-6">
      <PageHeader
        eyebrow="Vendas"
        title="Negócios"
        description="Arraste os cartões entre as etapas do funil para atualizar o estágio."
        actions={
          <div className="flex items-center gap-2">
            {(pipelines ?? []).length > 1 && (
              <select
                value={pipelineId ?? pipeline?.id ?? ''}
                onChange={(e) => setPipelineId(e.target.value)}
                className="h-10 rounded-full border border-white/10 bg-surface px-4 text-xs text-fg focus:outline-none"
              >
                {(pipelines ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <Button onClick={() => setCreating({ title: '', amount: 0, stageId: pipeline?.stages?.[0]?.id })} disabled={!pipeline}>
              <Plus size={15} /> Novo negócio
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-x-auto px-6 lg:px-8">
        {isLoading ? (
          <div className="flex gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-96 w-72" />
            ))}
          </div>
        ) : !pipeline ? (
          <Card glow={false}>
            <EmptyState title="Nenhum funil configurado" description="Crie um funil para começar a acompanhar negócios." />
          </Card>
        ) : (
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="flex h-full gap-4">
              {pipeline.stages.map((stage: any) => (
                <Column
                  key={stage.id}
                  stage={stage}
                  deals={deals.filter((d) => d.stageId === stage.id)}
                  onOpen={setOpenDeal}
                />
              ))}
            </div>
            <DragOverlay>
              {activeDeal && (
                <div className="w-64 rotate-2 rounded-2xl border border-white/20 bg-elevated p-3 shadow-drag">
                  <p className="text-sm font-medium text-fg">{activeDeal.title}</p>
                  <p className="mt-1 text-xs font-semibold text-success">{brl(activeDeal.amount)}</p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <DealDrawer dealId={openDeal} onClose={() => setOpenDeal(null)} />

      <Modal open={!!creating} onClose={() => setCreating(null)} title="Novo negócio">
        {creating && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(creating);
            }}
            className="space-y-4"
          >
            <Field label="Título">
              <Input required value={creating.title} onChange={(e) => setCreating({ ...creating, title: e.target.value })} placeholder="Ex.: Proposta — Tech Solutions" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Valor (R$)">
                <Input type="number" value={creating.amount} onChange={(e) => setCreating({ ...creating, amount: Number(e.target.value) })} />
              </Field>
              <Field label="Etapa">
                <select
                  className="w-full rounded-xl border border-white/10 bg-surface px-3.5 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-white/20"
                  value={creating.stageId ?? ''}
                  onChange={(e) => setCreating({ ...creating, stageId: e.target.value })}
                >
                  {pipeline?.stages?.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Empresa" hint="Obrigatório: contato ou empresa">
                <select
                  className="w-full rounded-xl border border-white/10 bg-surface px-3.5 py-2.5 text-sm text-fg focus:outline-none"
                  value={creating.companyId ?? ''}
                  onChange={(e) => setCreating({ ...creating, companyId: e.target.value || undefined })}
                >
                  <option value="">— Nenhuma —</option>
                  {(companies?.items ?? []).map((co) => (
                    <option key={co.id} value={co.id}>
                      {co.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Contato principal">
                <select
                  className="w-full rounded-xl border border-white/10 bg-surface px-3.5 py-2.5 text-sm text-fg focus:outline-none"
                  value={creating.primaryContactId ?? ''}
                  onChange={(e) => setCreating({ ...creating, primaryContactId: e.target.value || undefined })}
                >
                  <option value="">— Nenhum —</option>
                  {(contacts?.items ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {(users ?? []).length > 0 && (
              <Field label="Responsável">
                <select
                  className="w-full rounded-xl border border-white/10 bg-surface px-3.5 py-2.5 text-sm text-fg focus:outline-none"
                  value={creating.ownerId ?? ''}
                  onChange={(e) => setCreating({ ...creating, ownerId: e.target.value || undefined })}
                >
                  <option value="">— Eu —</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setCreating(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Criando…' : 'Criar negócio'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
