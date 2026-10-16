'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Button, Card, EmptyState, Field, Input, Modal, Skeleton } from '@/components/ui';

interface Company {
  id: string;
  name: string;
  cnpj?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  _count?: { contacts: number; deals: number };
}

export default function EmpresasPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Company> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['companies', search],
    queryFn: () => api.get<{ items: Company[]; total: number }>(`/api/crm/companies?search=${encodeURIComponent(search)}&pageSize=100`),
  });

  const save = useMutation({
    mutationFn: (payload: Partial<Company>) =>
      payload.id ? api.patch(`/api/crm/companies/${payload.id}`, payload) : api.post('/api/crm/companies', payload),
    onSuccess: () => {
      toast.success('Empresa salva');
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['companies-min'] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/crm/companies/${id}`),
    onSuccess: () => {
      toast.success('Empresa removida');
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Relacionamento"
        title="Empresas"
        description="Organizações vinculadas aos seus contatos e negócios."
        actions={
          <Button onClick={() => setEditing({})}>
            <Plus size={15} /> Nova empresa
          </Button>
        }
      />

      <div className="px-6 lg:px-8">
        <div className="relative mb-4 max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa" className="pl-9" />
        </div>

        <Card glow={false}>
          {isLoading ? (
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : (data?.items ?? []).length === 0 ? (
            <EmptyState
              icon={<Building2 size={20} />}
              title="Nenhuma empresa encontrada"
              description="Cadastre organizações para centralizar contatos e oportunidades."
              action={<Button onClick={() => setEditing({})}>Nova empresa</Button>}
            />
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {data!.items.map((co) => (
                <div key={co.id} className="group rounded-2xl border border-white/10 bg-elevated p-4 transition-colors hover:border-white/20">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg">{co.name}</p>
                      <p className="mt-0.5 text-xs text-faint">
                        {[co.city, co.state].filter(Boolean).join(' · ') || 'Sem localização'}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={() => setEditing(co)} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-fg">
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => confirm(`Remover ${co.name}?`) && remove.mutate(co.id)}
                        className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-4 text-xs text-muted">
                    <span>{co._count?.contacts ?? 0} contatos</span>
                    <span>{co._count?.deals ?? 0} negócios</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar empresa' : 'Nova empresa'}>
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(editing);
            }}
            className="space-y-4"
          >
            <Field label="Nome">
              <Input required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="CNPJ">
                <Input value={editing.cnpj ?? ''} onChange={(e) => setEditing({ ...editing, cnpj: e.target.value })} />
              </Field>
              <Field label="Telefone">
                <Input value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </Field>
            </div>
            <Field label="Site">
              <Input value={editing.website ?? ''} onChange={(e) => setEditing({ ...editing, website: e.target.value })} placeholder="https://" />
            </Field>
            <div className="grid grid-cols-[1fr_100px] gap-4">
              <Field label="Cidade">
                <Input value={editing.city ?? ''} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
              </Field>
              <Field label="UF">
                <Input maxLength={2} value={editing.state ?? ''} onChange={(e) => setEditing({ ...editing, state: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
