'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy, XCircle, Building2, User, CalendarClock, MessageSquare, Activity as ActivityIcon, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Avatar, Badge, Button, Drawer, Field, Input, Textarea } from '@/components/ui';
import { ACTIVITY_LABELS, DEAL_STATUS_LABELS, brl, formatDate, formatTime, toDateInput } from '@/lib/labels';
import { CustomFieldsSection } from './custom-fields-section';

export function DealDrawer({ dealId, onClose }: { dealId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [lossOpen, setLossOpen] = useState(false);
  const [lossReason, setLossReason] = useState('');
  const [items, setItems] = useState<any[]>([]);

  const { data: deal } = useQuery({
    queryKey: ['deal', dealId],
    queryFn: () => api.get<any>(`/api/deals/${dealId}`),
    enabled: !!dealId,
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get<any[]>('/api/crm/products'),
  });

  useEffect(() => {
    if (deal?.items) {
      setItems(
        deal.items.map((i: any) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          productId: i.productId ?? null,
        })),
      );
    }
  }, [deal?.id]);

  const { data: timeline } = useQuery({
    queryKey: ['deal-timeline', dealId],
    queryFn: () => api.get<any[]>(`/api/deals/timeline/deal/${dealId}`),
    enabled: !!dealId,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['deal', dealId] });
    qc.invalidateQueries({ queryKey: ['deal-timeline', dealId] });
    qc.invalidateQueries({ queryKey: ['deals-board'] });
    qc.invalidateQueries({ queryKey: ['my-day'] });
  }

  const save = useMutation({
    mutationFn: (data: any) => api.patch(`/api/deals/${dealId}`, data),
    onSuccess: () => {
      invalidate();
      toast.success('Negócio atualizado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: (data: any) => api.patch(`/api/deals/${dealId}/move`, data),
    onSuccess: () => {
      invalidate();
      toast.success('Negócio movido');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: () => api.post('/api/deals/notes', { entityType: 'deal', entityId: dealId, body: note }),
    onSuccess: () => {
      setNote('');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addActivity = useMutation({
    mutationFn: (type: string) =>
      api.post('/api/deals/activities', { type, subject: `${ACTIVITY_LABELS[type as keyof typeof ACTIVITY_LABELS]} registrada`, dealId, contactId: deal?.primaryContactId }),
    onSuccess: () => {
      invalidate();
      toast.success('Atividade registrada');
    },
  });

  const itemsTotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);

  function updateItem(idx: number, patch: any) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function pickProduct(idx: number, productId: string) {
    const p = (products ?? []).find((x) => x.id === productId);
    updateItem(idx, {
      productId: productId || null,
      ...(p ? { description: p.name, unitPrice: Number(p.price) } : {}),
    });
  }

  return (
    <Drawer
      open={!!dealId}
      onClose={onClose}
      title={deal?.title ?? 'Negócio'}
      subtitle={deal?.pipeline?.name}
      width="max-w-2xl"
    >
      {!deal ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              color={
                deal.status === 'GANHO' ? '#8FBF9F' : deal.status === 'PERDIDO' ? '#C98B8B' : '#7C9CBF'
              }
            >
              {DEAL_STATUS_LABELS[deal.status]}
            </Badge>
            <Badge color={deal.stage?.color}>{deal.stage?.name}</Badge>
            {deal.owner && (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Avatar name={deal.owner.name} size={18} /> {deal.owner.name}
              </span>
            )}
          </div>

          {deal.status === 'ABERTO' && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => move.mutate({ stageId: deal.stageId, status: 'GANHO', finalAmount: deal.amount })}
              >
                <Trophy size={13} /> Marcar como ganho
              </Button>
              <Button size="sm" variant="danger" onClick={() => setLossOpen((v) => !v)}>
                <XCircle size={13} /> Perder
              </Button>
            </div>
          )}

          {lossOpen && (
            <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4">
              <Field label="Motivo da perda">
                <Input value={lossReason} onChange={(e) => setLossReason(e.target.value)} placeholder="Ex.: preço, concorrência, timing" />
              </Field>
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setLossOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!lossReason}
                  onClick={() => move.mutate({ stageId: deal.stageId, status: 'PERDIDO', lossReason }, { onSuccess: () => setLossOpen(false) })}
                >
                  Confirmar perda
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor (R$)">
              <Input
                type="number"
                defaultValue={deal.amount}
                onBlur={(e) => save.mutate({ amount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Previsão de fechamento">
              <Input
                type="date"
                defaultValue={deal.expectedCloseDate ? toDateInput(deal.expectedCloseDate).slice(0, 10) : ''}
                onChange={(e) => save.mutate({ expectedCloseDate: e.target.value || null })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Etapa">
              <select
                className="w-full rounded-xl border border-white/10 bg-surface px-3.5 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-white/20"
                value={deal.stageId}
                onChange={(e) => move.mutate({ stageId: e.target.value, status: 'ABERTO' })}
              >
                {deal.pipeline?.stages?.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted">Vínculos</span>
              <div className="space-y-1 text-sm">
                {deal.company && (
                  <p className="flex items-center gap-2 text-muted">
                    <Building2 size={14} /> {deal.company.name}
                  </p>
                )}
                {deal.primaryContact && (
                  <p className="flex items-center gap-2 text-muted">
                    <User size={14} /> {deal.primaryContact.fullName}
                  </p>
                )}
                {deal.wonAt && (
                  <p className="flex items-center gap-2 text-success">
                    <CalendarClock size={14} /> Ganho em {formatDate(deal.wonAt)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-fg">Itens do negócio</span>
              <span className="text-sm text-muted">Total: {brl(itemsTotal)}</span>
            </div>
            <div className="space-y-2">
              {items.length === 0 && <p className="text-xs text-faint">Nenhum item adicionado.</p>}
              {items.map((it, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <select
                    value={it.productId ?? ''}
                    onChange={(e) => pickProduct(idx, e.target.value)}
                    className="w-36 rounded-xl border border-white/10 bg-surface px-3 py-2 text-xs text-fg focus:outline-none"
                  >
                    <option value="">Produto livre</option>
                    {(products ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="min-w-[8rem] flex-1"
                    placeholder="Descrição"
                    value={it.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                  />
                  <Input
                    type="number"
                    className="w-20"
                    value={it.quantity}
                    onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                  />
                  <Input
                    type="number"
                    className="w-28"
                    value={it.unitPrice}
                    onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                  />
                  <button
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                    title="Remover item"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setItems((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0, productId: null }])}
              >
                <Plus size={13} /> Adicionar item
              </Button>
              <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ items })}>
                Salvar itens
              </Button>
            </div>
          </div>

          <CustomFieldsSection entityType="Deal" entityId={deal.id} />

          <div className="flex flex-wrap gap-2 border-t border-white/5 pt-4">
            {(['CALL', 'MEETING', 'EMAIL', 'WHATSAPP', 'VISIT'] as const).map((t) => (
              <button
                key={t}
                onClick={() => addActivity.mutate(t)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted transition-colors hover:border-white/20 hover:text-fg"
              >
                + {ACTIVITY_LABELS[t]}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <MessageSquare size={15} className="text-muted" />
              <span className="text-sm font-semibold text-fg">Linha do tempo</span>
            </div>
            <div className="space-y-3">
              {(!timeline || timeline.length === 0) && <p className="text-xs text-faint">Nenhuma interação registrada ainda.</p>}
              {(timeline ?? []).map((ev, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <ActivityIcon size={14} className="mt-0.5 shrink-0 text-faint" />
                  <div className="min-w-0">
                    <p className="text-fg">
                      {ev.kind === 'activity' && ev.data.subject}
                      {ev.kind === 'note' && ev.data.body}
                      {ev.kind === 'stage' && `Etapa alterada`}
                    </p>
                    <p className="text-xs text-faint">
                      {ev.data.author?.name ?? ev.data.createdBy?.name ?? ''} · {formatDate(ev.at, true)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-white/5 pt-4">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Escreva uma nota…" className="min-h-[70px]" />
            <div className="mt-2 flex justify-end">
              <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
                Adicionar nota
              </Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
