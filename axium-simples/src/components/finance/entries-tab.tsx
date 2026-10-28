'use client';

import { useMemo, useState } from 'react';
import {
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useSupabaseQuery, isMissingSchema } from '@/lib/use-supabase-query';
import type { Contact, Deal, FinanceCategory, FinanceEntry } from '@/lib/types';
import {
  FINANCE_KIND_COLORS,
  FINANCE_KIND_LABELS,
  FINANCE_KINDS,
  FINANCE_STATUS_COLORS,
  FINANCE_STATUS_LABELS,
  FINANCE_STATUSES,
  type FinanceKind,
  type FinanceStatus,
} from '@/lib/labels';
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
import { StatCard } from '@/components/layout/page-header';
import { SchemaSetupNotice } from '@/components/layout/db-setup-notice';
import { brl } from '@/lib/utils';
import { formatDateOnly, isPendingOverdue, todayDateKey } from '@/lib/finance';

type EntryForm = Partial<FinanceEntry> & { id?: string; amount?: number | string | null };

type EntriesData = {
  entries: FinanceEntry[];
  categories: FinanceCategory[];
  contacts: Contact[];
  deals: Deal[];
};

type KindFilter = 'TODOS' | FinanceKind;
type StatusFilter = 'TODOS' | FinanceStatus | 'ATRASADO';

function sumAmounts(entries: FinanceEntry[]) {
  return entries.reduce((total, entry) => total + Number(entry.amount ?? 0), 0);
}

export function FinanceEntriesTab() {
  const supabase = useMemo(() => createClient(), []);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('TODOS');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS');
  const [editing, setEditing] = useState<EntryForm | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, error, loading, refresh } = useSupabaseQuery<EntriesData>(async () => {
    const [entriesRes, categoriesRes, contactsRes, dealsRes] = await Promise.all([
      supabase
        .from('finance_entries')
        .select(
          '*, category:finance_categories(*), contact:contacts(*), deal:deals(id,title)',
        )
        .order('due_date', { ascending: false }),
      supabase.from('finance_categories').select('*').order('name'),
      supabase.from('contacts').select('*').order('full_name'),
      supabase.from('deals').select('id,title').order('title'),
    ]);

    const firstError = [
      entriesRes.error,
      categoriesRes.error,
      contactsRes.error,
      dealsRes.error,
    ].find(Boolean);
    if (firstError) return { data: null, error: firstError };

    return {
      data: {
        entries: (entriesRes.data ?? []) as FinanceEntry[],
        categories: (categoriesRes.data ?? []) as FinanceCategory[],
        contacts: (contactsRes.data ?? []) as Contact[],
        deals: (dealsRes.data ?? []) as Deal[],
      },
      error: null,
    };
  }, []);

  const stats = useMemo(() => {
    const list = data?.entries ?? [];
    const paid = list.filter((entry) => entry.status === 'PAGO');
    const pending = list.filter((entry) => entry.status === 'PENDENTE');
    const received = sumAmounts(paid.filter((entry) => entry.kind === 'RECEITA'));
    const spent = sumAmounts(paid.filter((entry) => entry.kind === 'DESPESA'));

    return {
      balance: received - spent,
      toReceive: sumAmounts(pending.filter((entry) => entry.kind === 'RECEITA')),
      toPay: sumAmounts(pending.filter((entry) => entry.kind === 'DESPESA')),
      overdue: sumAmounts(pending.filter((entry) => isPendingOverdue(entry))),
    };
  }, [data?.entries]);

  const visibleEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.entries ?? [])
      .filter((entry) => {
        if (kindFilter !== 'TODOS' && entry.kind !== kindFilter) return false;
        if (statusFilter === 'ATRASADO' && !isPendingOverdue(entry)) return false;
        if (
          statusFilter !== 'TODOS' &&
          statusFilter !== 'ATRASADO' &&
          entry.status !== statusFilter
        ) {
          return false;
        }
        if (!term) return true;
        return [
          entry.description,
          entry.category?.name,
          entry.contact?.full_name,
          entry.contact?.company_name,
          entry.deal?.title,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [data?.entries, search, kindFilter, statusFilter]);

  function openNew() {
    setEditing({
      kind: 'RECEITA',
      status: 'PENDENTE',
      due_date: todayDateKey(),
      amount: '',
    });
  }

  async function save(form: EntryForm) {
    if (!form.description?.trim()) {
      toast.error('Informe a descrição do lançamento.');
      return;
    }

    const amount = Number(form.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Informe um valor maior que zero.');
      return;
    }

    if (!form.due_date) {
      toast.error('Informe o vencimento.');
      return;
    }

    const status = (form.status ?? 'PENDENTE') as FinanceStatus;
    const paidAt =
      status === 'PAGO' ? form.paid_at?.slice(0, 10) || todayDateKey() : null;

    setSaving(true);
    const payload = {
      kind: (form.kind ?? 'RECEITA') as FinanceKind,
      description: form.description.trim(),
      amount,
      category_id: form.category_id || null,
      contact_id: form.contact_id || null,
      deal_id: form.deal_id || null,
      due_date: form.due_date,
      status,
      paid_at: paidAt,
      notes: form.notes?.trim() || null,
    };

    const { error: saveError } = form.id
      ? await supabase.from('finance_entries').update(payload).eq('id', form.id)
      : await supabase.from('finance_entries').insert(payload);

    setSaving(false);

    if (saveError) {
      toast.error(saveError.message);
      return;
    }

    toast.success('Lançamento salvo');
    setEditing(null);
    refresh();
  }

  async function changeStatus(entry: FinanceEntry, status: FinanceStatus) {
    const { error: updateError } = await supabase
      .from('finance_entries')
      .update({
        status,
        paid_at: status === 'PAGO' ? todayDateKey() : null,
      })
      .eq('id', entry.id);

    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    toast.success(status === 'PAGO' ? 'Lançamento marcado como pago' : 'Lançamento reaberto');
    refresh();
  }

  async function remove(entry: FinanceEntry) {
    if (!window.confirm(`Remover o lançamento "${entry.description}"?`)) return;
    const { error: deleteError } = await supabase
      .from('finance_entries')
      .delete()
      .eq('id', entry.id);
    if (deleteError) {
      toast.error(deleteError.message);
      return;
    }
    toast.success('Lançamento removido');
    refresh();
  }

  if (error && isMissingSchema(error)) {
    return <SchemaSetupNotice error={error} />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">
        Não foi possível carregar o financeiro: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Saldo realizado"
          value={brl(stats.balance)}
          hint="Receitas pagas menos despesas pagas"
          accent={stats.balance >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          label="A receber"
          value={brl(stats.toReceive)}
          hint="Receitas pendentes"
          accent="info"
        />
        <StatCard
          label="A pagar"
          value={brl(stats.toPay)}
          hint="Despesas pendentes"
          accent="warning"
        />
        <StatCard
          label="Atrasados"
          value={brl(stats.overdue)}
          hint="Pendências com vencimento passado"
          accent={stats.overdue > 0 ? 'danger' : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por descrição, categoria ou contato"
              className="pl-9"
            />
          </div>
          <Select
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as KindFilter)}
            className="w-auto"
            aria-label="Filtrar por tipo"
          >
            <option value="TODOS">Todos os tipos</option>
            {FINANCE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {FINANCE_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="w-auto"
            aria-label="Filtrar por status"
          >
            <option value="TODOS">Todos os status</option>
            {FINANCE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {FINANCE_STATUS_LABELS[status]}
              </option>
            ))}
            <option value="ATRASADO">Atrasados</option>
          </Select>
        </div>
        <Button onClick={openNew}>
          <Plus size={15} /> Novo lançamento
        </Button>
      </div>

      <Card glow={false}>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : visibleEntries.length === 0 ? (
          <EmptyState
            icon={<Wallet size={18} strokeWidth={1.6} />}
            title="Nenhum lançamento encontrado"
            description="Registre contas a pagar e receber para acompanhar o caixa."
            action={<Button onClick={openNew}>Novo lançamento</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-eyebrow uppercase text-faint">
                  <th className="px-5 py-3 font-medium">Descrição</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Categoria</th>
                  <th className="px-5 py-3 font-medium">Vínculo</th>
                  <th className="px-5 py-3 font-medium">Vencimento</th>
                  <th className="px-5 py-3 font-medium">Valor</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visibleEntries.map((entry) => {
                  const overdue = isPendingOverdue(entry);
                  const linkName = entry.contact?.company_name ?? entry.contact?.full_name;

                  return (
                    <tr key={entry.id} className="group hover:bg-white/[0.02]">
                      <td className="max-w-64 px-5 py-3">
                        <p className="truncate font-medium text-fg">{entry.description}</p>
                        {entry.notes && (
                          <p className="truncate text-xs text-faint">{entry.notes}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge color={FINANCE_KIND_COLORS[entry.kind]}>
                          {FINANCE_KIND_LABELS[entry.kind]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {entry.category ? (
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: entry.category.color }}
                            />
                            {entry.category.name}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {linkName && <p className="text-xs text-fg">{linkName}</p>}
                        {entry.deal && (
                          <p className="text-[11px] text-faint">{entry.deal.title}</p>
                        )}
                        {!linkName && !entry.deal && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <p className={overdue ? 'text-xs text-danger' : 'text-xs text-muted-foreground'}>
                          {formatDateOnly(entry.due_date)}
                        </p>
                        {entry.status === 'PAGO' && entry.paid_at && (
                          <p className="text-[11px] text-faint">
                            pago em {formatDateOnly(entry.paid_at)}
                          </p>
                        )}
                      </td>
                      <td
                        className="whitespace-nowrap px-5 py-3 font-medium"
                        style={{ color: FINANCE_KIND_COLORS[entry.kind] }}
                      >
                        {brl(entry.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          color={overdue ? '#C98B8B' : FINANCE_STATUS_COLORS[entry.status]}
                        >
                          {overdue ? 'Atrasado' : FINANCE_STATUS_LABELS[entry.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {entry.status === 'PAGO' ? (
                            <button
                              onClick={() => changeStatus(entry, 'PENDENTE')}
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-fg"
                              aria-label="Reabrir lançamento"
                              title="Reabrir"
                            >
                              <RotateCcw size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => changeStatus(entry, 'PAGO')}
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-success/10 hover:text-success"
                              aria-label="Marcar como pago"
                              title="Marcar como pago"
                            >
                              <Check size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => setEditing(entry)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-fg"
                            aria-label="Editar lançamento"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => remove(entry)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                            aria-label="Remover lançamento"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar lançamento' : 'Novo lançamento'}
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
            <Field label="Descrição">
              <Input
                required
                placeholder="Ex.: Mensalidade cliente, compra de material…"
                value={editing.description ?? ''}
                onChange={(event) =>
                  setEditing({ ...editing, description: event.target.value })
                }
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                <Select
                  value={editing.kind ?? 'RECEITA'}
                  onChange={(event) =>
                    setEditing({ ...editing, kind: event.target.value as FinanceKind })
                  }
                >
                  {FINANCE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {FINANCE_KIND_LABELS[kind]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Valor (R$)">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editing.amount ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, amount: event.target.value })
                  }
                />
              </Field>
              <Field label="Vencimento">
                <Input
                  required
                  type="date"
                  value={editing.due_date?.slice(0, 10) ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, due_date: event.target.value })
                  }
                />
              </Field>
              <Field label="Status">
                <Select
                  value={editing.status ?? 'PENDENTE'}
                  onChange={(event) =>
                    setEditing({ ...editing, status: event.target.value as FinanceStatus })
                  }
                >
                  {FINANCE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {FINANCE_STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Categoria">
                <Select
                  value={editing.category_id ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, category_id: event.target.value || null })
                  }
                >
                  <option value="">— Nenhuma —</option>
                  {(data?.categories ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data do pagamento" hint="Ao marcar como pago, usa hoje se vazio.">
                <Input
                  type="date"
                  value={editing.paid_at?.slice(0, 10) ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, paid_at: event.target.value || null })
                  }
                />
              </Field>
              <Field label="Contato">
                <Select
                  value={editing.contact_id ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, contact_id: event.target.value || null })
                  }
                >
                  <option value="">— Nenhum —</option>
                  {(data?.contacts ?? []).map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.company_name ? `${contact.full_name} · ${contact.company_name}` : contact.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Negócio">
                <Select
                  value={editing.deal_id ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, deal_id: event.target.value || null })
                  }
                >
                  <option value="">— Nenhum —</option>
                  {(data?.deals ?? []).map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Observações">
              <Textarea
                value={editing.notes ?? ''}
                onChange={(event) => setEditing({ ...editing, notes: event.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
