'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, ShieldCheck, Monitor, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { api, useAuth } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Skeleton } from '@/components/ui';
import { ROLES, ROLE_LABELS, can, formatDate } from '@/lib/labels';
import { cn } from '@/lib/utils';

type Tab = 'perfil' | 'equipe' | 'seguranca';

export default function ConfiguracoesPage() {
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<Tab>('perfil');
  const canViewTeam = user && can(user.role as any, 'config', 'view');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'perfil', label: 'Perfil' },
    ...(canViewTeam ? [{ id: 'equipe' as Tab, label: 'Equipe' }] : []),
    { id: 'seguranca', label: 'Segurança' },
  ];

  return (
    <div className="pb-16">
      <PageHeader eyebrow="Administração" title="Configurações" description={`Empresa: ${user?.tenant?.name ?? '—'}`} />

      <div className="px-6 lg:px-8">
        <div className="mb-6 flex gap-1 border-b border-white/5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn('-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors', tab === t.id ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'perfil' && <ProfileTab />}
        {tab === 'equipe' && canViewTeam && <TeamTab />}
        {tab === 'seguranca' && <SecurityTab />}
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user?.name ?? '', phone: user?.phone ?? '' });

  const save = useMutation({
    mutationFn: () => api.patch('/api/auth/me', form),
    onSuccess: async () => {
      const me = await api.get<any>('/api/auth/me');
      setUser({ ...me });
      toast.success('Perfil atualizado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card glow={false}>
        <CardHeader title="Dados pessoais" subtitle="Como você aparece para a equipe" />
        <div className="space-y-4 p-6">
          <Field label="Nome">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="E-mail">
            <Input value={user?.email ?? ''} disabled />
          </Field>
          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Salvar alterações
            </Button>
          </div>
        </div>
      </Card>
      <Card glow={false}>
        <CardHeader title="Sua conta" />
        <div className="flex items-center gap-4 p-6">
          <Avatar name={user?.name ?? '?'} url={user?.avatarUrl} size={56} />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-fg">{user?.name}</p>
            <p className="text-xs text-muted">{user?.email}</p>
            <div className="flex gap-2 pt-1">
              <Badge>{user?.role ? ROLE_LABELS[user.role] ?? user.role : ''}</Badge>
              {user?.team && <Badge>{user.team.name}</Badge>}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function TeamTab() {
  const qc = useQueryClient();
  const [invite, setInvite] = useState<any | null>(null);
  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.get<any[]>('/api/users') });

  const send = useMutation({
    mutationFn: (payload: any) => api.post('/api/users/invite', payload),
    onSuccess: () => {
      toast.success('Usuário adicionado');
      qc.invalidateQueries({ queryKey: ['users'] });
      setInvite(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => api.patch(`/api/users/${id}/role`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Permissão atualizada');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Usuário removido');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card glow={false}>
      <CardHeader
        title="Equipe"
        subtitle="Membros com acesso à sua empresa"
        action={
          <Button onClick={() => setInvite({ name: '', email: '', role: 'USER', password: '' })}>
            <UserPlus size={15} /> Adicionar
          </Button>
        }
      />
      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (users ?? []).length === 0 ? (
        <EmptyState title="Nenhum usuário" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-eyebrow uppercase text-faint">
              <th className="px-5 py-3 font-medium">Membro</th>
              <th className="px-5 py-3 font-medium">Perfil</th>
              <th className="px-5 py-3 font-medium">Desde</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users!.map((u) => (
              <tr key={u.id} className="group hover:bg-white/[0.02]">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} url={u.avatarUrl} size={32} />
                    <div>
                      <p className="font-medium text-fg">{u.name}</p>
                      <p className="text-xs text-faint">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  {u.role === 'OWNER' ? (
                    <Badge>{ROLE_LABELS.OWNER}</Badge>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value })}
                      className="rounded-lg border border-white/10 bg-surface px-2 py-1 text-xs text-fg focus:outline-none"
                    >
                      {ROLES.filter((r) => r !== 'OWNER').map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-5 py-3 text-muted">{formatDate(u.createdAt)}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100">
                    {u.role !== 'OWNER' && (
                      <button onClick={() => confirm(`Remover ${u.name}?`) && remove.mutate(u.id)} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={!!invite} onClose={() => setInvite(null)} title="Adicionar usuário">
        {invite && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate(invite);
            }}
            className="space-y-4"
          >
            <Field label="Nome">
              <Input autoFocus required value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <Input type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Perfil de acesso">
                <Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                  {ROLES.filter((r) => r !== 'OWNER').map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Senha inicial" hint="Mínimo 8 caracteres">
                <Input type="text" required minLength={8} value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setInvite(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={send.isPending}>
                Adicionar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
}

function SecurityTab() {
  const qc = useQueryClient();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const { data: sessions } = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<any[]>('/api/auth/sessions') });

  const changePw = useMutation({
    mutationFn: () => api.post('/api/auth/change-password', pw),
    onSuccess: () => {
      setPw({ currentPassword: '', newPassword: '' });
      toast.success('Senha alterada');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/api/auth/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Sessão encerrada');
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card glow={false}>
        <CardHeader title="Alterar senha" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            changePw.mutate();
          }}
          className="space-y-4 p-6"
        >
          <Field label="Senha atual">
            <Input type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="Nova senha" hint="Mínimo 8 caracteres">
            <Input type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={changePw.isPending}>
              <KeyRound size={14} /> Alterar senha
            </Button>
          </div>
        </form>
      </Card>

      <Card glow={false}>
        <CardHeader title="Sessões ativas" subtitle="Dispositivos conectados à sua conta" />
        <div className="divide-y divide-white/5">
          {(!sessions || sessions.length === 0) && <EmptyState title="Nenhuma sessão ativa" />}
          {(sessions ?? []).map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-6 py-3">
              <Monitor size={16} className="text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{s.device ?? 'Dispositivo desconhecido'}</p>
                <p className="text-xs text-faint">
                  {s.ip ?? '—'} · último acesso {formatDate(s.lastSeenAt, true)}
                </p>
              </div>
              <button onClick={() => revoke.mutate(s.id)} className="text-xs text-muted hover:text-danger">
                encerrar
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-white/5 px-6 py-3 text-xs text-faint">
          <ShieldCheck size={14} /> Sessões protegidas por refresh token com rotação.
        </div>
      </Card>
    </div>
  );
}
