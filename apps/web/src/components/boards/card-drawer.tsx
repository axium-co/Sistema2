'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Trash2, Tag, User2, CalendarClock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Avatar, Badge, Button, Drawer, Field, Input, Textarea } from '@/components/ui';
import { CARD_PRIORITY_COLORS, PRIORITY_LABELS, formatDate, toDateInput } from '@/lib/labels';
import { cn } from '@/lib/utils';

export function CardDrawer({ cardId, boardId, onClose }: { cardId: string | null; boardId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const [newChecklist, setNewChecklist] = useState('');

  const { data: card } = useQuery({
    queryKey: ['card', cardId],
    queryFn: () => api.get<any>(`/api/boards/cards/${cardId}`),
    enabled: !!cardId,
  });

  const { data: users } = useQuery({ queryKey: ['users-min'], queryFn: () => api.get<any[]>('/api/users'), retry: false });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['card', cardId] });
    qc.invalidateQueries({ queryKey: ['board', boardId] });
  }

  const save = useMutation({ mutationFn: (data: any) => api.patch(`/api/boards/cards/${cardId}`, data), onSuccess: invalidate, onError: (e: any) => toast.error(e.message) });
  const assign = useMutation({ mutationFn: (userId: string) => api.post(`/api/boards/cards/${cardId}/assignees`, { userId }), onSuccess: invalidate });
  const unassign = useMutation({ mutationFn: (userId: string) => api.del(`/api/boards/cards/${cardId}/assignees/${userId}`), onSuccess: invalidate });
  const addLabel = useMutation({ mutationFn: (labelId: string) => api.post(`/api/boards/cards/${cardId}/labels`, { labelId }), onSuccess: invalidate });
  const removeLabel = useMutation({ mutationFn: (labelId: string) => api.del(`/api/boards/cards/${cardId}/labels/${labelId}`), onSuccess: invalidate });
  const addChecklist = useMutation({
    mutationFn: (title: string) => api.post(`/api/boards/cards/${cardId}/checklists`, { title }),
    onSuccess: () => {
      setNewChecklist('');
      invalidate();
    },
  });
  const addItem = useMutation({
    mutationFn: ({ checklistId, title }: { checklistId: string; title: string }) => api.post(`/api/boards/checklists/${checklistId}/items`, { title }),
    onSuccess: (_r, v) => {
      setNewItem((s) => ({ ...s, [v.checklistId]: '' }));
      invalidate();
    },
  });
  const toggleItem = useMutation({ mutationFn: ({ id, checked }: { id: string; checked: boolean }) => api.patch(`/api/boards/checklist-items/${id}`, { checked }), onSuccess: invalidate });
  const delItem = useMutation({ mutationFn: (id: string) => api.del(`/api/boards/checklist-items/${id}`), onSuccess: invalidate });
  const addComment = useMutation({
    mutationFn: (body: string) => api.post(`/api/boards/cards/${cardId}/comments`, { body }),
    onSuccess: () => {
      setComment('');
      invalidate();
    },
  });

  const listLabels = card?.board?.labels ?? [];
  const assignedIds = new Set((card?.assignees ?? []).map((a: any) => a.user.id));
  const cardLabelIds = new Set((card?.labels ?? []).map((l: any) => l.label.id));

  return (
    <Drawer open={!!cardId} onClose={onClose} title={card?.title ?? 'Tarefa'} subtitle={card?.list?.name} width="max-w-2xl">
      {!card ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => save.mutate({ completed: !card.completedAt })}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md border transition-colors',
                card.completedAt ? 'border-success bg-success/20 text-success' : 'border-white/20 text-transparent hover:border-white/40',
              )}
            >
              <Check size={14} />
            </button>
            <span className="text-sm text-muted">{card.completedAt ? 'Concluída' : 'Marcar como concluída'}</span>
          </div>

          <Field label="Título">
            <Input defaultValue={card.title} onBlur={(e) => e.target.value !== card.title && save.mutate({ title: e.target.value })} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Prioridade">
              <select
                className="w-full rounded-xl border border-white/10 bg-surface px-3.5 py-2.5 text-sm text-fg focus:outline-none"
                value={card.priority}
                onChange={(e) => save.mutate({ priority: e.target.value })}
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Início">
              <Input type="date" defaultValue={card.startDate ? toDateInput(card.startDate).slice(0, 10) : ''} onChange={(e) => save.mutate({ startDate: e.target.value || null })} />
            </Field>
            <Field label="Prazo">
              <Input type="date" defaultValue={card.dueDate ? toDateInput(card.dueDate).slice(0, 10) : ''} onChange={(e) => save.mutate({ dueDate: e.target.value || null })} />
            </Field>
          </div>

          <Field label="Descrição">
            <Textarea defaultValue={card.description} onBlur={(e) => e.target.value !== card.description && save.mutate({ description: e.target.value })} placeholder="Detalhe a tarefa…" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                <User2 size={14} /> Responsáveis
              </p>
              <div className="flex flex-wrap gap-2">
                {(users ?? []).map((u) => {
                  const on = assignedIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => (on ? unassign.mutate(u.id) : assign.mutate(u.id))}
                      className={cn('flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors', on ? 'border-white/30 bg-white/10 text-fg' : 'border-white/10 text-muted hover:text-fg')}
                    >
                      <Avatar name={u.name} size={16} /> {u.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                <Tag size={14} /> Etiquetas
              </p>
              <div className="flex flex-wrap gap-2">
                {listLabels.map((l: any) => {
                  const on = cardLabelIds.has(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => (on ? removeLabel.mutate(l.id) : addLabel.mutate(l.id))}
                      className={cn('rounded-full border px-2.5 py-0.5 text-xs transition-opacity', !on && 'opacity-40')}
                      style={{ borderColor: `${l.color}66`, backgroundColor: `${l.color}22`, color: l.color }}
                    >
                      {l.name}
                    </button>
                  );
                })}
                {listLabels.length === 0 && <span className="text-xs text-faint">Sem etiquetas no quadro.</span>}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted">Checklists</p>
            <div className="space-y-4">
              {(card.checklists ?? []).map((cl: any) => {
                const done = cl.items.filter((i: any) => i.checked).length;
                return (
                  <div key={cl.id} className="rounded-2xl border border-white/10 bg-elevated p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-fg">{cl.title}</span>
                      <span className="text-xs text-faint">
                        {done}/{cl.items.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {cl.items.map((item: any) => (
                        <div key={item.id} className="group flex items-center gap-2">
                          <button
                            onClick={() => toggleItem.mutate({ id: item.id, checked: !item.checked })}
                            className={cn('flex h-4 w-4 items-center justify-center rounded border', item.checked ? 'border-success bg-success/20 text-success' : 'border-white/20 text-transparent')}
                          >
                            <Check size={11} />
                          </button>
                          <span className={cn('flex-1 text-sm', item.checked ? 'text-faint line-through' : 'text-fg')}>{item.title}</span>
                          <button onClick={() => delItem.mutate(item.id)} className="text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={newItem[cl.id] ?? ''}
                        onChange={(e) => setNewItem((s) => ({ ...s, [cl.id]: e.target.value }))}
                        placeholder="Novo item…"
                        className="h-8 py-0 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (newItem[cl.id] ?? '').trim()) {
                            e.preventDefault();
                            addItem.mutate({ checklistId: cl.id, title: newItem[cl.id] });
                          }
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-2">
                <Input value={newChecklist} onChange={(e) => setNewChecklist(e.target.value)} placeholder="Nova checklist…" />
                <Button size="sm" variant="secondary" disabled={!newChecklist.trim()} onClick={() => addChecklist.mutate(newChecklist)}>
                  <Plus size={13} />
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-4">
            <p className="mb-2 text-xs font-medium text-muted">Comentários</p>
            <div className="space-y-3">
              {(card.comments ?? []).map((c: any) => (
                <div key={c.id} className="flex gap-2.5">
                  <Avatar name={c.author?.name ?? '?'} url={c.author?.avatarUrl} size={28} />
                  <div className="min-w-0 flex-1 rounded-2xl border border-white/5 bg-elevated px-3 py-2">
                    <p className="text-xs text-faint">
                      {c.author?.name} · {formatDate(c.createdAt, true)}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-fg">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-end gap-2">
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escreva um comentário…" className="min-h-[60px]" />
              <Button size="icon" disabled={!comment.trim()} onClick={() => addComment.mutate(comment)}>
                <Send size={15} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
