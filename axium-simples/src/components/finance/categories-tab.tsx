'use client';

import { useMemo, useState } from 'react';
import { Palette, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useSupabaseQuery, isMissingSchema } from '@/lib/use-supabase-query';
import type { FinanceCategory } from '@/lib/types';
import { Button, Card, EmptyState, Field, Input, Modal, Skeleton } from '@/components/ui';
import { SchemaSetupNotice } from '@/components/layout/db-setup-notice';
import { formatDate } from '@/lib/utils';

type CategoryForm = Partial<FinanceCategory> & { id?: string };

export function FinanceCategoriesTab() {
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState<CategoryForm | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, error, loading, refresh } = useSupabaseQuery<FinanceCategory[]>(async () => {
    const result = await supabase.from('finance_categories').select('*').order('name');
    return { data: result.data as FinanceCategory[] | null, error: result.error };
  }, []);

  async function save(form: CategoryForm) {
    if (!form.name?.trim()) {
      toast.error('Informe o nome da categoria.');
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      color: form.color || '#7C9CBF',
    };

    const { error: saveError } = form.id
      ? await supabase.from('finance_categories').update(payload).eq('id', form.id)
      : await supabase.from('finance_categories').insert(payload);

    setSaving(false);

    if (saveError) {
      toast.error(saveError.message);
      return;
    }

    toast.success('Categoria salva');
    setEditing(null);
    refresh();
  }

  async function remove(category: FinanceCategory) {
    if (
      !window.confirm(
        `Remover a categoria "${category.name}"? Os lançamentos vinculados ficarão sem categoria.`,
      )
    ) {
      return;
    }

    const { error: deleteError } = await supabase
      .from('finance_categories')
      .delete()
      .eq('id', category.id);

    if (deleteError) {
      toast.error(deleteError.message);
      return;
    }

    toast.success('Categoria removida');
    refresh();
  }

  if (error && isMissingSchema(error)) {
    return <SchemaSetupNotice error={error} />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">
        Não foi possível carregar as categorias: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ color: '#7C9CBF' })}>
          <Plus size={15} /> Nova categoria
        </Button>
      </div>

      <Card glow={false}>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            icon={<Tags size={18} strokeWidth={1.6} />}
            title="Nenhuma categoria encontrada"
            description="Crie categorias para organizar receitas e despesas."
            action={<Button onClick={() => setEditing({ color: '#7C9CBF' })}>Nova categoria</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-eyebrow uppercase text-faint">
                  <th className="px-5 py-3 font-medium">Categoria</th>
                  <th className="px-5 py-3 font-medium">Cor</th>
                  <th className="px-5 py-3 font-medium">Criada em</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(data ?? []).map((category) => (
                  <tr key={category.id} className="group hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2 font-medium text-fg">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.name}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs uppercase text-muted-foreground">
                      {category.color}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(category.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => setEditing(category)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-fg"
                          aria-label="Editar categoria"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => remove(category)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                          aria-label="Remover categoria"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar categoria' : 'Nova categoria'}
        width="max-w-md"
      >
        {editing && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save(editing);
            }}
            className="space-y-4"
          >
            <Field label="Nome">
              <Input
                required
                placeholder="Ex.: Marketing, Impostos…"
                value={editing.name ?? ''}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </Field>
            <Field label="Cor">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={editing.color ?? '#7C9CBF'}
                  onChange={(event) => setEditing({ ...editing, color: event.target.value })}
                  className="h-10 w-12 cursor-pointer rounded-xl border border-white/10 bg-surface p-1"
                  aria-label="Escolher cor"
                />
                <Input
                  value={editing.color ?? '#7C9CBF'}
                  onChange={(event) => setEditing({ ...editing, color: event.target.value })}
                />
              </div>
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

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-faint">
        <Palette size={12} /> As categorias aparecem nos filtros e relatórios do financeiro.
      </p>
    </div>
  );
}
