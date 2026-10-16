'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ArrowLeft, Plus, GripVertical, MessageSquare, ListChecks, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { CardDrawer } from '@/components/boards/card-drawer';
import { CARD_PRIORITY_COLORS, PRIORITY_LABELS, formatDate, isOverdue } from '@/lib/labels';
import { cn } from '@/lib/utils';

interface Card {
  id: string;
  title: string;
  priority: string;
  dueDate?: string | null;
  completedAt?: string | null;
  assignees: { user: { id: string; name: string; avatarUrl?: string | null } }[];
  labels: { label: { id: string; name: string; color: string } }[];
  checklists?: { items: { checked: boolean }[] }[];
  _count?: { comments: number };
}

function TaskCard({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  const checks = (card.checklists ?? []).flatMap((c) => c.items);
  const doneChecks = checks.filter((i) => i.checked).length;
  const overdue = card.dueDate && !card.completedAt && isOverdue(card.dueDate);

  return (
    <div
      ref={setNodeRef}
      className={cn('group rounded-xl border border-white/10 bg-elevated p-2.5 transition-colors hover:border-white/20', isDragging && 'opacity-40')}
    >
      <div className="flex items-start gap-1">
        <button {...listeners} {...attributes} className="mt-0.5 cursor-grab text-faint opacity-0 group-hover:opacity-100" aria-label="Arrastar">
          <GripVertical size={13} />
        </button>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          {card.labels.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {card.labels.map((l) => (
                <span key={l.label.id} className="h-1.5 w-6 rounded-full" style={{ backgroundColor: l.label.color }} />
              ))}
            </div>
          )}
          <p className={cn('text-sm text-fg', card.completedAt && 'text-faint line-through')}>{card.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-faint">
            <span className="flex items-center gap-1" style={{ color: CARD_PRIORITY_COLORS[card.priority] }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CARD_PRIORITY_COLORS[card.priority] }} />
              {PRIORITY_LABELS[card.priority]}
            </span>
            {card.dueDate && (
              <span className={cn('flex items-center gap-1', overdue && 'text-danger')}>
                <Clock size={11} /> {formatDate(card.dueDate)}
              </span>
            )}
            {checks.length > 0 && (
              <span className="flex items-center gap-1">
                <ListChecks size={11} /> {doneChecks}/{checks.length}
              </span>
            )}
            {(card._count?.comments ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare size={11} /> {card._count?.comments}
              </span>
            )}
          </div>
        </button>
        {card.assignees.length > 0 && (
          <div className="flex -space-x-1.5">
            {card.assignees.slice(0, 2).map((a) => (
              <span key={a.user.id} className="flex h-5 w-5 items-center justify-center rounded-full border border-elevated bg-white/10 text-[9px] text-muted">
                {a.user.name[0]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ListColumn({ list, boardId, onOpenCard }: { list: any; boardId: string; onOpenCard: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: list.id });
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  const createCard = useMutation({
    mutationFn: (t: string) => api.post(`/api/boards/lists/${list.id}/cards`, { title: t }),
    onSuccess: () => {
      setTitle('');
      setAdding(false);
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-fg">{list.name}</span>
        <span className="text-xs text-faint">{list.cards.length}</span>
      </div>
      <div ref={setNodeRef} className={cn('flex-1 space-y-2 rounded-2xl border border-dashed p-2 transition-colors', isOver ? 'border-white/25 bg-white/5' : 'border-white/5')}>
        {list.cards.map((c: Card) => (
          <TaskCard key={c.id} card={c} onOpen={() => onOpenCard(c.id)} />
        ))}
        {adding ? (
          <div className="space-y-2">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da tarefa" className="h-9 text-sm" onKeyDown={(e) => e.key === 'Enter' && title.trim() && createCard.mutate(title)} />
            <div className="flex gap-2">
              <Button size="sm" disabled={!title.trim()} onClick={() => createCard.mutate(title)}>
                Adicionar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-faint hover:bg-white/5 hover:text-fg">
            <Plus size={13} /> Adicionar tarefa
          </button>
        )}
      </div>
    </div>
  );
}

export default function BoardPage() {
  const params = useParams();
  const boardId = String(params.boardId);
  const router = useRouter();
  const qc = useQueryClient();
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingList, setAddingList] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: board, isLoading } = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api.get<any>(`/api/boards/${boardId}`),
    enabled: !!boardId,
  });

  const moveCard = useMutation({
    mutationFn: ({ id, listId }: { id: string; listId: string }) => api.patch(`/api/boards/cards/${id}/move`, { listId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board', boardId] }),
    onError: (e: any) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  const addList = useMutation({
    mutationFn: (name: string) => api.post(`/api/boards/${boardId}/lists`, { name }),
    onSuccess: () => {
      setAddingList(null);
      qc.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id as string | undefined;
    if (!overId || !board) return;
    const targetList = board.lists.find((l: any) => l.id === overId);
    if (!targetList) return;
    const sourceList = board.lists.find((l: any) => l.cards.some((c: Card) => c.id === e.active.id));
    if (!sourceList || sourceList.id === targetList.id) return;
    moveCard.mutate({ id: e.active.id as string, listId: overId });
  }

  const allCards = board ? board.lists.flatMap((l: any) => l.cards) : [];
  const activeCard = allCards.find((c: Card) => c.id === activeId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4 lg:px-8">
        <button onClick={() => router.push('/tarefas')} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-fg">
          <ArrowLeft size={17} />
        </button>
        <h1 className="text-lg font-extrabold tracking-tight text-fg">{board?.name ?? 'Quadro'}</h1>
      </div>

      <div className="flex-1 overflow-x-auto p-4 lg:p-6">
        {isLoading ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : !board ? (
          <p className="text-sm text-muted">Quadro não encontrado.</p>
        ) : (
          <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)} onDragEnd={onDragEnd}>
            <div className="flex h-full gap-4">
              {board.lists.map((list: any) => (
                <ListColumn key={list.id} list={list} boardId={boardId} onOpenCard={setOpenCard} />
              ))}
              <div className="w-72 shrink-0">
                {addingList !== null ? (
                  <div className="space-y-2 rounded-2xl border border-white/10 bg-surface p-3">
                    <Input autoFocus value={addingList} onChange={(e) => setAddingList(e.target.value)} placeholder="Nome da lista" className="h-9 text-sm" onKeyDown={(e) => e.key === 'Enter' && addingList.trim() && addList.mutate(addingList)} />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={!addingList.trim()} onClick={() => addList.mutate(addingList)}>
                        Adicionar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddingList(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingList('')} className="flex w-full items-center gap-1.5 rounded-2xl border border-dashed border-white/10 px-3 py-2.5 text-sm text-faint hover:border-white/20 hover:text-fg">
                    <Plus size={14} /> Adicionar lista
                  </button>
                )}
              </div>
            </div>
            <DragOverlay>
              {activeCard && (
                <div className="w-64 rotate-2 rounded-xl border border-white/20 bg-elevated p-2.5 shadow-drag">
                  <p className="text-sm text-fg">{activeCard.title}</p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <CardDrawer cardId={openCard} boardId={boardId} onClose={() => setOpenCard(null)} />
    </div>
  );
}
