'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock, GripVertical, Plus, Search, Target, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useSupabaseQuery, isMissingSchema } from '@/lib/use-supabase-query';
import type { Contact, Deal, Pipeline, PipelineStage } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { SchemaSetupNotice } from '@/components/layout/db-setup-notice';
import { brl, formatDate, isOverdue } from '@/lib/utils';
import { DEAL_STATUSES, DEAL_STATUS_LABELS, type DealStatus } from '@/lib/labels';

type DealForm = Partial<Deal> & { id?: string; amount?: number | string | null };

type DealsData = {
  deals: Deal[];
  pipelines: Pipeline[];
  stages: PipelineStage[];
};

export function DealsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<DealForm | null>(null);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const { data, error, loading, refresh } = useSupabaseQuery<DealsData>(async () => {
    const [dealsRes, pipelinesRes, stagesRes] = await Promise.all([
      supabase
        .from('deals')
        .select('*, company:companies(id,name), contact:contacts(*)')
        .order('created_at', { ascending: false }),
      supabase.from('pipelines').select('*').order('created_at'),
      supabase.from('pipeline_stages').select('*').order('position'),
    ]);

    const firstError = [dealsRes.error, pipelinesRes.error, stagesRes.error].find(Boolean);
    if (firstError) return { data: null, error: firstError };

    return {
      data: {
        deals: (dealsRes.data ?? []) as Deal[],
        pipelines: (pipelinesRes.data ?? []) as Pipeline[],
        stages: (stagesRes.data ?? []) as PipelineStage[],
      },
      error: null,
    };
  }, []);

  const { data: contacts } = useSupabaseQuery<Contact[]>(async () => {
    const result = await supabase.from('contacts').select('*').order('full_name');
    return { data: result.data as Contact[] | null, error: result.error };
  }, []);

  const pipelines = data?.pipelines ?? [];
  const activePipeline =
    pipelines.find((pipeline) => pipeline.id === pipelineId) ??
    pipelines.find((pipeline) => pipeline.is_default) ??
    pipelines[0];

  const stages = useMemo(() => {
    const all = data?.stages ?? [];
    return all
      .filter((stage) => stage.pipeline_id === activePipeline?.id)
      .sort((a, b) => a.position - b.position);
  }, [data?.stages, activePipeline?.id]);

  const openDeals = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.deals ?? []).filter((deal) => {
      if (deal.status !== 'ABERTO' || deal.pipeline_id !== activePipeline?.id) return false;
      if (!term) return true;
      return [
        deal.title,
        deal.contact?.company_name,
        deal.company?.name,
        deal.contact?.full_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [data?.deals, activePipeline?.id, search]);

  const closedDeals = useMemo(
    () =>
      (data?.deals ?? []).filter(
        (deal) => deal.pipeline_id === activePipeline?.id && deal.status !== 'ABERTO',
      ),
    [data?.deals, activePipeline?.id],
  );

  function openNew(stageId?: string) {
    if (!activePipeline) {
      toast.error('Nenhum funil configurado. Rode o SQL inicial.');
      return;
    }
    setEditing({
      pipeline_id: activePipeline.id,
      stage_id: stageId ?? stages[0]?.id,
      status: 'ABERTO',
      amount: 0,
    });
  }

  async function save(form: DealForm) {
    if (!form.title?.trim()) {
      toast.error('Informe o título do negócio.');
      return;
    }
    if (!form.stage_id || !form.pipeline_id) {
      toast.error('Selecione a etapa do funil.');
      return;
    }

    setSaving(true);
    const payload = {
      pipeline_id: form.pipeline_id,
      stage_id: form.stage_id,
      title: form.title.trim(),
      amount: Number(form.amount ?? 0),
      contact_id: form.contact_id || null,
      expected_close_date: form.expected_close_date || null,
      status: (form.status ?? 'ABERTO') as DealStatus,
      loss_reason: form.loss_reason?.trim() || null,
    };

    const { error: saveError } = form.id
      ? await supabase.from('deals').update(payload).eq('id', form.id)
      : await supabase.from('deals').insert(payload);

    setSaving(false);

    if (saveError) {
      toast.error(saveError.message);
      return;
    }

    toast.success('Negócio salvo');
    setEditing(null);
    refresh();
  }

  async function setStatus(deal: DealForm, status: DealStatus) {
    if (!deal.id) return;
    let lossReason = deal.loss_reason ?? null;
    if (status === 'PERDIDO' && !lossReason) {
      lossReason = window.prompt('Motivo da perda (opcional):') || null;
    }
    const { error: updateError } = await supabase
      .from('deals')
      .update({ status, loss_reason: status === 'PERDIDO' ? lossReason : null })
      .eq('id', deal.id);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    toast.success(`Negócio marcado como ${DEAL_STATUS_LABELS[status].toLowerCase()}`);
    setEditing(null);
    refresh();
  }

  async function remove(deal: DealForm) {
    if (!deal.id || !window.confirm(`Remover o negócio ${deal.title}?`)) return;
    const { error: deleteError } = await supabase.from('deals').delete().eq('id', deal.id);
    if (deleteError) {
      toast.error(deleteError.message);
      return;
    }
    toast.success('Negócio removido');
    setEditing(null);
    refresh();
  }

  async function onDragEnd(event: DragEndEvent) {
    const dealId = event.active.data.current?.dealId as string | undefined;
    const stageId = event.over?.data.current?.stageId as string | undefined;
    if (!dealId || !stageId) return;

    const deal = (data?.deals ?? []).find((item) => item.id === dealId);
    if (!deal || deal.stage_id === stageId) return;

    const { error: updateError } = await supabase
      .from('deals')
      .update({ stage_id: stageId })
      .eq('id', dealId);

    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    refresh();
  }

  return (
    <div className="space-y-4">
      {error && isMissingSchema(error) && <SchemaSetupNotice error={error} />}
      {error && !isMissingSchema(error) && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">
          Não foi possível carregar os negócios: {error.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={activePipeline?.id ?? ''}
            onChange={(event) => setPipelineId(event.target.value)}
            className="w-auto min-w-44"
          >
            {pipelines.length === 0 && <option value="">Nenhum funil</option>}
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </Select>
          <div className="relative w-full max-w-xs">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar negócio"
              className="pl-9"
            />
          </div>
        </div>
        <Button onClick={() => openNew()}>
          <Plus size={15} /> Novo negócio
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-72" />
          ))}
        </div>
      ) : stages.length === 0 ? (
        <Card glow={false}>
          <EmptyState
            icon={<Target size={18} strokeWidth={1.6} />}
            title="Nenhum funil configurado"
            description="Rode o SQL inicial para criar o funil de vendas com etapas."
          />
        </Card>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => {
              const stageDeals = openDeals.filter((deal) => deal.stage_id === stage.id);
              const stageTotal = stageDeals.reduce((acc, deal) => acc + Number(deal.amount), 0);
              return (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  count={stageDeals.length}
                  total={stageTotal}
                  onAdd={() => openNew(stage.id)}
                >
                  {stageDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      onEdit={() => setEditing(deal)}
                    />
                  ))}
                  {stageDeals.length === 0 && (
                    <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-[11px] text-faint">
                      Arraste um negócio para cá
                    </p>
                  )}
                </StageColumn>
              );
            })}
          </div>
        </DndContext>
      )}

      {closedDeals.length > 0 && (
        <Card glow={false}>
          <div className="border-b border-white/5 px-5 py-4">
            <h3 className="text-sm font-semibold text-fg">Negócios fechados</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {closedDeals.filter((deal) => deal.status === 'GANHO').length} ganho(s) ·{' '}
              {closedDeals.filter((deal) => deal.status === 'PERDIDO').length} perdido(s)
            </p>
          </div>
          <div className="divide-y divide-white/5">
            {closedDeals.slice(0, 10).map((deal) => (
              <button
                key={deal.id}
                onClick={() => setEditing(deal)}
                className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-white/[0.02]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{deal.title}</p>
                  <p className="text-xs text-faint">
                    {deal.contact?.company_name ?? deal.company?.name ?? 'Sem empresa'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{brl(deal.amount)}</span>
                  <Badge color={deal.status === 'GANHO' ? '#8FBF9F' : '#C98B8B'}>
                    {DEAL_STATUS_LABELS[deal.status]}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar negócio' : 'Novo negócio'}
        width="max-w-2xl"
      >
        {editing && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save(editing);
            }}
            className="space-y-4"
          >
            <Field label="Título">
              <Input
                required
                value={editing.title ?? ''}
                onChange={(event) => setEditing({ ...editing, title: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Valor (R$)">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.amount ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, amount: event.target.value })
                  }
                />
              </Field>
              <Field label="Previsão de fechamento">
                <Input
                  type="date"
                  value={editing.expected_close_date ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, expected_close_date: event.target.value || null })
                  }
                />
              </Field>
              <Field label="Contato principal">
                <Select
                  value={editing.contact_id ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, contact_id: event.target.value || null })
                  }
                >
                  <option value="">— Nenhum —</option>
                  {(contacts ?? []).map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Etapa">
                <Select
                  value={editing.stage_id ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, stage_id: event.target.value })
                  }
                >
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select
                  value={editing.status ?? 'ABERTO'}
                  onChange={(event) =>
                    setEditing({ ...editing, status: event.target.value as DealStatus })
                  }
                >
                  {DEAL_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {DEAL_STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {editing.status === 'PERDIDO' && (
              <Field label="Motivo da perda">
                <Textarea
                  value={editing.loss_reason ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, loss_reason: event.target.value })
                  }
                />
              </Field>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-4">
              <div className="flex gap-2">
                {editing.id && editing.status !== 'GANHO' && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setStatus(editing, 'GANHO')}
                  >
                    Marcar ganho
                  </Button>
                )}
                {editing.id && editing.status !== 'PERDIDO' && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setStatus(editing, 'PERDIDO')}
                  >
                    Marcar perdido
                  </Button>
                )}
                {editing.id && editing.status !== 'ABERTO' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStatus(editing, 'ABERTO')}
                  >
                    Reabrir
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {editing.id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(editing)}
                  >
                    <Trash2 size={14} /> Excluir
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function StageColumn({
  stage,
  count,
  total,
  onAdd,
  children,
}: {
  stage: PipelineStage;
  count: number;
  total: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { stageId: stage.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-surface/60 p-3 transition-colors ${
        isOver ? 'border-white/25 bg-white/[0.04]' : 'border-white/10'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
            <p className="truncate text-xs font-semibold text-fg">{stage.name}</p>
            <span className="text-[11px] text-faint">{count}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{brl(total)}</p>
        </div>
        <button
          onClick={onAdd}
          className="rounded-lg p-1 text-faint hover:bg-white/5 hover:text-fg"
          aria-label={`Adicionar negócio em ${stage.name}`}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

function DealCard({ deal, onEdit }: { deal: Deal; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { dealId: deal.id },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`group rounded-xl border border-white/10 bg-elevated p-3 shadow-card transition-colors hover:border-white/20 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start gap-1.5">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab touch-none text-faint opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Mover negócio"
        >
          <GripVertical size={13} />
        </button>
        <button
          onClick={onEdit}
          className="min-w-0 flex-1 text-left"
          disabled={isDragging}
        >
          <p className="text-sm font-medium leading-snug text-fg">{deal.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {deal.contact?.company_name ??
              deal.company?.name ??
              deal.contact?.full_name ??
              'Sem empresa'}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg">{brl(deal.amount)}</span>
            {deal.expected_close_date && (
              <span
                className={`flex items-center gap-1 text-[10px] ${
                  isOverdue(`${deal.expected_close_date}T23:59:59`)
                    ? 'text-danger'
                    : 'text-faint'
                }`}
              >
                <CalendarClock size={11} /> {formatDate(deal.expected_close_date)}
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
