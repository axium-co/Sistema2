'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, Trash2, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Button, Card, EmptyState, Field, Input, Modal, Skeleton } from '@/components/ui';
import { formatDate } from '@/lib/labels';

interface Contact {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  companyId?: string | null;
  company?: { id: string; name: string } | null;
  createdAt: string;
}

export default function ContatosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search],
    queryFn: () => api.get<{ items: Contact[]; total: number }>(`/api/crm/contacts?search=${encodeURIComponent(search)}&pageSize=100`),
  });

  const { data: companies } = useQuery({
    queryKey: ['companies-min'],
    queryFn: () => api.get<{ items: any[] }>('/api/crm/companies?pageSize=100'),
  });

  const save = useMutation({
    mutationFn: (payload: Partial<Contact>) =>
      payload.id ? api.patch(`/api/crm/contacts/${payload.id}`, payload) : api.post('/api/crm/contacts', payload),
    onSuccess: () => {
      toast.success('Contato salvo');
      qc.invalidateQueries({ queryKey: ['contacts'] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/crm/contacts/${id}`),
    onSuccess: () => {
      toast.success('Contato removido');
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Relacionamento"
        title="Contatos"
        description="Todas as pessoas com quem sua equipe se relaciona."
        actions={
          <Button onClick={() => setEditing({})}>
            <Plus size={15} /> Novo contato
          </Button>
        }
      />

      <div className="px-6 lg:px-8">
        <div className="relative mb-4 max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, e-mail ou telefone" className="pl-9" />
        </div>

        <Card glow={false}>
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (data?.items ?? []).length === 0 ? (
            <EmptyState title="Nenhum contato encontrado" description="Cadastre pessoas para começar a registrar interações." action={<Button onClick={() => setEditing({})}>Novo contato</Button>} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-eyebrow uppercase text-faint">
                  <th className="px-5 py-3 font-medium">Nome</th>
                  <th className="px-5 py-3 font-medium">Empresa</th>
                  <th className="px-5 py-3 font-medium">Contato</th>
                  <th className="px-5 py-3 font-medium">Criado em</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data!.items.map((c) => (
                  <tr key={c.id} className="group hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <p className="font-medium text-fg">{c.fullName}</p>
                      {c.jobTitle && <p className="text-xs text-faint">{c.jobTitle}</p>}
                    </td>
                    <td className="px-5 py-3 text-muted">{c.company?.name ?? '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-0.5 text-xs text-muted">
                        {c.email && (
                          <span className="flex items-center gap-1.5">
                            <Mail size={12} /> {c.email}
                          </span>
                        )}
                        {c.phone && (
                          <span className="flex items-center gap-1.5">
                            <Phone size={12} /> {c.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">{formatDate(c.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => setEditing(c)} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-fg">
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => confirm(`Remover ${c.fullName}?`) && remove.mutate(c.id)}
                          className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar contato' : 'Novo contato'}>
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(editing);
            }}
            className="space-y-4"
          >
            <Field label="Nome completo">
              <Input required value={editing.fullName ?? ''} onChange={(e) => setEditing({ ...editing, fullName: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="E-mail">
                <Input type="email" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </Field>
              <Field label="Telefone">
                <Input value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cargo">
                <Input value={editing.jobTitle ?? ''} onChange={(e) => setEditing({ ...editing, jobTitle: e.target.value })} />
              </Field>
              <Field label="Empresa">
                <select
                  className="w-full rounded-xl border border-white/10 bg-surface px-3.5 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-white/20"
                  value={editing.companyId ?? ''}
                  onChange={(e) => setEditing({ ...editing, companyId: e.target.value || null })}
                >
                  <option value="">— Nenhuma —</option>
                  {(companies?.items ?? []).map((co) => (
                    <option key={co.id} value={co.id}>
                      {co.name}
                    </option>
                  ))}
                </select>
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

