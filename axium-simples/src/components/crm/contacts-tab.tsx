'use client';

import { useMemo, useState } from 'react';
import {
  Mail,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useSupabaseQuery, isMissingColumn, isMissingSchema } from '@/lib/use-supabase-query';
import type { Contact } from '@/lib/types';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { SchemaSetupNotice } from '@/components/layout/db-setup-notice';
import { formatDate, googleMapsDirectionsUrl, googleMapsUrl } from '@/lib/utils';

type ContactForm = Partial<Contact> & { id?: string };

export function ContactsTab() {
  const supabase = useMemo(() => createClient(), []);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ContactForm | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, error, loading, refresh } = useSupabaseQuery<Contact[]>(async () => {
    const result = await supabase.from('contacts').select('*').order('full_name');
    return { data: result.data as Contact[] | null, error: result.error };
  }, []);

  const contacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = data ?? [];
    if (!term) return list;
    return list.filter((contact) =>
      [
        contact.full_name,
        contact.email,
        contact.whatsapp,
        contact.address,
        contact.company_name,
        contact.company_cnpj,
        contact.company_website,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [data, search]);

  async function save(form: ContactForm) {
    if (!form.full_name?.trim()) {
      toast.error('Informe o nome do contato.');
      return;
    }

    setSaving(true);
    const payload = {
      full_name: form.full_name.trim(),
      email: form.email?.trim() || null,
      whatsapp: form.whatsapp?.trim() || null,
      job_title: form.job_title?.trim() || null,
      source: form.source?.trim() || null,
      company_name: form.company_name?.trim() || null,
      company_cnpj: form.company_cnpj?.trim() || null,
      company_website: form.company_website?.trim() || null,
      address: form.address?.trim() || null,
      notes: form.notes?.trim() || null,
    };

    const { error: saveError } = form.id
      ? await supabase.from('contacts').update(payload).eq('id', form.id)
      : await supabase.from('contacts').insert(payload);

    setSaving(false);

    if (saveError) {
      toast.error(
        isMissingColumn(saveError)
          ? 'Rode a migração supabase/migrations/0002_address_and_company.sql para salvar os dados da empresa.'
          : saveError.message,
      );
      return;
    }

    toast.success('Contato salvo');
    setEditing(null);
    refresh();
  }

  async function remove(contact: Contact) {
    if (!window.confirm(`Remover o contato ${contact.full_name}?`)) return;
    const { error: deleteError } = await supabase.from('contacts').delete().eq('id', contact.id);
    if (deleteError) {
      toast.error(deleteError.message);
      return;
    }
    toast.success('Contato removido');
    refresh();
  }

  return (
    <div className="space-y-4">
      {error && isMissingSchema(error) && <SchemaSetupNotice error={error} />}
      {error && !isMissingSchema(error) && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">
          Não foi possível carregar os contatos: {error.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, empresa, e-mail, WhatsApp ou endereço"
            className="pl-9"
          />
        </div>
        <Button onClick={() => setEditing({})}>
          <Plus size={15} /> Novo contato
        </Button>
      </div>

      <Card glow={false}>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<UserRound size={18} strokeWidth={1.6} />}
            title="Nenhum contato encontrado"
            description="Cadastre a pessoa e os dados da empresa em um único registro."
            action={<Button onClick={() => setEditing({})}>Novo contato</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-eyebrow uppercase text-faint">
                  <th className="px-5 py-3 font-medium">Nome</th>
                  <th className="px-5 py-3 font-medium">Empresa</th>
                  <th className="px-5 py-3 font-medium">Contato</th>
                  <th className="px-5 py-3 font-medium">Endereço</th>
                  <th className="px-5 py-3 font-medium">Origem</th>
                  <th className="px-5 py-3 font-medium">Criado em</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {contacts.map((contact) => (
                  <tr key={contact.id} className="group hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <p className="font-medium text-fg">{contact.full_name}</p>
                      {contact.job_title && (
                        <p className="text-xs text-faint">{contact.job_title}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-fg">{contact.company_name ?? '—'}</p>
                      {contact.company_cnpj && (
                        <p className="text-xs text-faint">{contact.company_cnpj}</p>
                      )}
                      {contact.company_website && (
                        <a
                          href={
                            contact.company_website.startsWith('http')
                              ? contact.company_website
                              : `https://${contact.company_website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-fg"
                        >
                          {contact.company_website}
                        </a>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="flex items-center gap-1.5 hover:text-fg"
                          >
                            <Mail size={12} /> {contact.email}
                          </a>
                        )}
                        {contact.whatsapp && (
                          <a
                            href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 hover:text-fg"
                          >
                            <Phone size={12} /> {contact.whatsapp}
                          </a>
                        )}
                        {!contact.email && !contact.whatsapp && '—'}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {contact.address ? (
                        <div className="flex items-center gap-2">
                          <a
                            href={googleMapsUrl(contact.address) ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-w-0 items-center gap-1.5 text-xs hover:text-fg"
                          >
                            <MapPin size={12} className="shrink-0" />
                            <span className="max-w-48 truncate">{contact.address}</span>
                          </a>
                          <a
                            href={googleMapsDirectionsUrl(contact.address) ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Navegar no Google Maps"
                            className="shrink-0 rounded p-1 text-faint hover:bg-white/5 hover:text-fg"
                            aria-label="Navegar no Google Maps"
                          >
                            <Navigation size={12} />
                          </a>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{contact.source ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(contact.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => setEditing(contact)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-fg"
                          aria-label="Editar contato"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => remove(contact)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                          aria-label="Remover contato"
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
        title={editing?.id ? 'Editar contato' : 'Novo contato'}
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
            <Field label="Nome completo">
              <Input
                required
                value={editing.full_name ?? ''}
                onChange={(event) => setEditing({ ...editing, full_name: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="E-mail">
                <Input
                  type="email"
                  value={editing.email ?? ''}
                  onChange={(event) => setEditing({ ...editing, email: event.target.value })}
                />
              </Field>
              <Field label="WhatsApp">
                <Input
                  value={editing.whatsapp ?? ''}
                  onChange={(event) => setEditing({ ...editing, whatsapp: event.target.value })}
                />
              </Field>
              <Field label="Cargo">
                <Input
                  value={editing.job_title ?? ''}
                  onChange={(event) => setEditing({ ...editing, job_title: event.target.value })}
                />
              </Field>
              <Field label="Origem">
                <Input
                  placeholder="Indicação, site, evento…"
                  value={editing.source ?? ''}
                  onChange={(event) => setEditing({ ...editing, source: event.target.value })}
                />
              </Field>
            </div>
            <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-eyebrow uppercase text-faint">Empresa</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome da empresa">
                  <Input
                    value={editing.company_name ?? ''}
                    onChange={(event) =>
                      setEditing({ ...editing, company_name: event.target.value })
                    }
                  />
                </Field>
                <Field label="CNPJ">
                  <Input
                    value={editing.company_cnpj ?? ''}
                    onChange={(event) =>
                      setEditing({ ...editing, company_cnpj: event.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label="Site da empresa">
                <Input
                  placeholder="https://"
                  value={editing.company_website ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, company_website: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field
              label="Endereço"
              hint="Ao salvar, o endereço vira um link para o Google Maps."
            >
              <Input
                placeholder="Rua, número, bairro, cidade/UF"
                value={editing.address ?? ''}
                onChange={(event) => setEditing({ ...editing, address: event.target.value })}
              />
            </Field>
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
