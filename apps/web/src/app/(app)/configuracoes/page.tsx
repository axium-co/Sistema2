'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, ShieldCheck, Monitor, KeyRound, Mail, X, Plus, Package, Target, SlidersHorizontal, Zap, Copy, CreditCard, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api, useAuth } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Skeleton } from '@/components/ui';
import { ROLES, ROLE_LABELS, can, formatDate, brl, PLANS, SUBSCRIPTION_STATUS_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

type Tab = 'perfil' | 'equipe' | 'crm' | 'privacidade' | 'api' | 'plano' | 'seguranca';

export default function ConfiguracoesPage() {
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<Tab>('perfil');
  const canViewTeam = user && can(user.role as any, 'config', 'view');
  const canManageCrm = user && can(user.role as any, 'crm', 'edit');
  const canManagePlan = user && can(user.role as any, 'config', 'edit');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'perfil', label: 'Perfil' },
    ...(canViewTeam ? [{ id: 'equipe' as Tab, label: 'Equipe' }] : []),
    ...(canManageCrm ? [{ id: 'crm' as Tab, label: 'CRM' }] : []),
    ...(canViewTeam ? [{ id: 'privacidade' as Tab, label: 'Privacidade' }] : []),
    ...(canViewTeam ? [{ id: 'api' as Tab, label: 'API' }] : []),
    ...(canManagePlan ? [{ id: 'plano' as Tab, label: 'Plano' }] : []),
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
        {tab === 'crm' && canManageCrm && <CrmSettingsTab />}
        {tab === 'privacidade' && canViewTeam && <PrivacyTab />}
        {tab === 'api' && canViewTeam && <ApiKeysTab />}
        {tab === 'plano' && canManagePlan && <PlanTab />}
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
  const { data: invitations } = useQuery({ queryKey: ['invitations'], queryFn: () => api.get<any[]>('/api/users/invitations') });

  const send = useMutation({
    mutationFn: (payload: any) => api.post<{ inviteUrl?: string; mocked?: boolean }>('/api/users/invitations', payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['invitations'] });
      setInvite(null);
      if (res?.inviteUrl) {
        navigator.clipboard?.writeText(res.inviteUrl).catch(() => undefined);
        toast.success('Convite criado — link copiado (SMTP não configurado)');
      } else {
        toast.success('Convite enviado por e-mail');
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revokeInvite = useMutation({
    mutationFn: (id: string) => api.del(`/api/users/invitations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations'] });
      toast.success('Convite revogado');
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
    <div className="space-y-6">
    <Card glow={false}>
      <CardHeader
        title="Equipe"
        subtitle="Membros com acesso à sua empresa"
        action={
          <Button onClick={() => setInvite({ name: '', email: '', role: 'USER' })}>
            <UserPlus size={15} /> Convidar
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

      <Modal open={!!invite} onClose={() => setInvite(null)} title="Convidar para a equipe">
        {invite && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate(invite);
            }}
            className="space-y-4"
          >
            <Field label="Nome">
              <Input autoFocus value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} placeholder="Opcional" />
            </Field>
            <Field label="E-mail">
              <Input type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </Field>
            <Field label="Perfil de acesso">
              <Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                {ROLES.filter((r) => r !== 'OWNER').map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-faint">
              Enviaremos um e-mail com o link para o convidado criar a própria senha. Sem SMTP configurado, o link é copiado para você.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setInvite(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={send.isPending}>
                <Mail size={14} /> Enviar convite
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>

    <Card glow={false}>
      <CardHeader title="Convites pendentes" subtitle="Aguardando aceite (válidos por 7 dias)" />
      {(invitations ?? []).length === 0 ? (
        <EmptyState title="Nenhum convite pendente" />
      ) : (
        <div className="divide-y divide-white/5">
          {(invitations ?? []).map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 px-6 py-3">
              <Mail size={16} className="text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{inv.email}</p>
                <p className="text-xs text-faint">
                  {ROLE_LABELS[inv.role] ?? inv.role} · expira {formatDate(inv.expiresAt)}
                </p>
              </div>
              <button onClick={() => revokeInvite.mutate(inv.id)} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" title="Revogar convite">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
    </div>
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
      <TwoFactorCard />
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

      <Card glow={false} className="lg:col-span-2">
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

function TwoFactorCard() {
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ['2fa-status'], queryFn: () => api.get<{ enabled: boolean }>('/api/auth/2fa/status') });
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [disableOpen, setDisableOpen] = useState(false);

  const startSetup = useMutation({
    mutationFn: () => api.post<{ secret: string; otpauthUrl: string; qrDataUrl: string }>('/api/auth/2fa/setup'),
    onSuccess: (data) => setSetup(data),
    onError: (e: any) => toast.error(e.message),
  });

  const enable = useMutation({
    mutationFn: () => api.post('/api/auth/2fa/enable', { code }),
    onSuccess: () => {
      toast.success('Autenticação em duas etapas ativada');
      setSetup(null);
      setCode('');
      qc.invalidateQueries({ queryKey: ['2fa-status'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const disable = useMutation({
    mutationFn: () => api.post('/api/auth/2fa/disable', { code }),
    onSuccess: () => {
      toast.success('Autenticação em duas etapas desativada');
      setDisableOpen(false);
      setCode('');
      qc.invalidateQueries({ queryKey: ['2fa-status'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const enabled = status?.enabled ?? false;

  return (
    <Card glow={false}>
      <CardHeader
        title="Autenticação em duas etapas (2FA)"
        subtitle="Proteja sua conta com um aplicativo autenticador"
        action={<Badge color={enabled ? '#8FBF9F' : undefined}>{enabled ? 'Ativado' : 'Desativado'}</Badge>}
      />
      <div className="space-y-4 p-6">
        {setup ? (
          <>
            <p className="text-xs text-muted">
              Escaneie o QR Code no Google Authenticator, Authy ou similar e digite o código gerado para confirmar.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrDataUrl} alt="QR Code do 2FA" className="mx-auto w-44 rounded-xl border border-white/10 bg-white p-2" />
            <Field label="Chave secreta (fallback manual)">
              <Input readOnly value={setup.secret} className="font-mono text-xs" />
            </Field>
            <Field label="Código de verificação">
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setSetup(null); setCode(''); }}>
                Cancelar
              </Button>
              <Button onClick={() => enable.mutate()} disabled={enable.isPending || code.length !== 6}>
                Ativar 2FA
              </Button>
            </div>
          </>
        ) : enabled ? (
          <>
            <p className="text-xs text-muted">
              Sua conta está protegida. Ao entrar, será solicitado um código de 6 dígitos do seu aplicativo autenticador.
            </p>
            <div className="flex justify-end">
              <Button variant="danger" onClick={() => setDisableOpen(true)}>
                Desativar 2FA
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted">
              Ao ativar, o login pedirá um código temporário do aplicativo autenticador além da senha.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => startSetup.mutate()} disabled={startSetup.isPending}>
                <ShieldCheck size={14} /> Configurar 2FA
              </Button>
            </div>
          </>
        )}
      </div>

      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title="Desativar 2FA">
        <div className="space-y-4">
          <Field label="Código de verificação" hint="Digite o código atual do aplicativo autenticador para confirmar">
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setDisableOpen(false); setCode(''); }}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => disable.mutate()} disabled={disable.isPending || code.length !== 6}>
              Desativar
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

const CONSENT_PURPOSES = [
  { value: 'MARKETING', label: 'Marketing e comunicações' },
  { value: 'COMUNICACAO', label: 'Comunicação com o titular' },
  { value: 'TRATAMENTO', label: 'Tratamento de dados (contrato)' },
];

const REQUEST_TYPE_LABELS: Record<string, string> = {
  EXPORT: 'Exportação',
  ANONYMIZE: 'Anonimização',
  ERASURE: 'Exclusão',
};

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PrivacyTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canExport = user && can(user.role as any, 'config', 'export');
  const canDelete = user && can(user.role as any, 'config', 'delete');

  const { data: consents } = useQuery({ queryKey: ['lgpd-consents'], queryFn: () => api.get<any[]>('/api/lgpd/consents') });
  const { data: requests } = useQuery({ queryKey: ['lgpd-requests'], queryFn: () => api.get<any[]>('/api/lgpd/requests') });
  const { data: contacts } = useQuery({ queryKey: ['contacts-all'], queryFn: () => api.get<any[]>('/api/crm/contacts') });
  const { data: leads } = useQuery({ queryKey: ['leads-all'], queryFn: () => api.get<any[]>('/api/crm/leads') });

  const [consent, setConsent] = useState({ subjectType: 'Contact', subjectId: '', purpose: 'MARKETING' });

  const myData = useMutation({
    mutationFn: () => api.get<any>('/api/lgpd/me'),
    onSuccess: (data) => {
      downloadJson(data, 'meus-dados-lgpd.json');
      toast.success('Download iniciado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const grant = useMutation({
    mutationFn: () => api.post('/api/lgpd/consents', consent),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lgpd-consents'] });
      setConsent({ ...consent, subjectId: '' });
      toast.success('Consentimento registrado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.post(`/api/lgpd/consents/${id}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lgpd-consents'] });
      toast.success('Consentimento revogado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exportSubject = useMutation({
    mutationFn: (subject: { subjectType: string; subjectId: string }) => api.post<any>('/api/lgpd/export', subject),
    onSuccess: (data, subject) => {
      qc.invalidateQueries({ queryKey: ['lgpd-requests'] });
      downloadJson(data, `titular-${subject.subjectId}.json`);
      toast.success('Dados exportados');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const anonymize = useMutation({
    mutationFn: (subject: { subjectType: string; subjectId: string; erase: boolean }) => api.post('/api/lgpd/anonymize', subject),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lgpd-requests'] });
      qc.invalidateQueries({ queryKey: ['lgpd-consents'] });
      toast.success('Titular anonimizado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const subjects = consent.subjectType === 'Contact' ? contacts ?? [] : leads ?? [];
  const subjectLabel = (s: any) => (s.fullName ?? s.contact?.fullName ?? s.id) as string;

  return (
    <div className="space-y-6">
      <Card glow={false}>
        <CardHeader title="Seus dados" subtitle="Portabilidade garantida pelo art. 18 da LGPD" />
        <div className="flex items-center justify-between p-6">
          <p className="max-w-xl text-xs text-muted">
            Baixe uma cópia dos dados pessoais armazenados na sua conta (perfil e preferências) em formato JSON.
          </p>
          <Button onClick={() => myData.mutate()} disabled={myData.isPending}>
            Baixar meus dados
          </Button>
        </div>
      </Card>

      <Card glow={false}>
        <CardHeader title="Consentimentos" subtitle="Registro de base legal para o tratamento de dados" />
        <div className="space-y-4 p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              grant.mutate();
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="w-32">
              <Field label="Titular">
                <Select value={consent.subjectType} onChange={(e) => setConsent({ ...consent, subjectType: e.target.value, subjectId: '' })}>
                  <option value="Contact">Contato</option>
                  <option value="Lead">Lead</option>
                </Select>
              </Field>
            </div>
            <div className="min-w-[12rem] flex-1">
              <Field label="Quem">
                <Select value={consent.subjectId} onChange={(e) => setConsent({ ...consent, subjectId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {subjects.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {subjectLabel(s)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-56">
              <Field label="Finalidade">
                <Select value={consent.purpose} onChange={(e) => setConsent({ ...consent, purpose: e.target.value })}>
                  {CONSENT_PURPOSES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit" disabled={grant.isPending || !consent.subjectId}>
              <Plus size={14} /> Registrar
            </Button>
          </form>

          {(consents ?? []).length === 0 ? (
            <EmptyState title="Nenhum consentimento registrado" />
          ) : (
            <div className="divide-y divide-white/5 rounded-xl border border-white/5">
              {(consents ?? []).map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <ShieldCheck size={16} className={c.granted ? 'text-success' : 'text-faint'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">
                      {CONSENT_PURPOSES.find((p) => p.value === c.purpose)?.label ?? c.purpose}
                    </p>
                    <p className="text-xs text-faint">
                      {c.subjectType} · {formatDate(c.createdAt, true)}
                      {c.ip ? ` · ${c.ip}` : ''}
                    </p>
                  </div>
                  <Badge color={c.granted ? '#8FBF9F' : undefined}>{c.granted ? 'Concedido' : 'Revogado'}</Badge>
                  {c.granted && (
                    <button
                      onClick={() => revoke.mutate(c.id)}
                      className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                      title="Revogar"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card glow={false}>
        <CardHeader title="Solicitações de titular" subtitle="Histórico de exportações, anonimizações e exclusões" />
        <div className="space-y-4 p-6">
          {(requests ?? []).length === 0 ? (
            <EmptyState title="Nenhuma solicitação registrada" />
          ) : (
            <div className="divide-y divide-white/5 rounded-xl border border-white/5">
              {(requests ?? []).slice(0, 20).map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">
                      {REQUEST_TYPE_LABELS[r.type] ?? r.type} · {r.subjectType}
                    </p>
                    <p className="text-xs text-faint">{formatDate(r.createdAt, true)}</p>
                  </div>
                  <div className="flex gap-1">
                    {canExport && r.type !== 'EXPORT' && (
                      <button
                        onClick={() => exportSubject.mutate({ subjectType: r.subjectType, subjectId: r.subjectId })}
                        className="rounded-lg px-2 py-1 text-xs text-muted hover:text-fg"
                      >
                        exportar
                      </button>
                    )}
                    {canDelete && r.type !== 'ERASURE' && (
                      <button
                        onClick={() => confirm('Anonimizar os dados deste titular?') && anonymize.mutate({ subjectType: r.subjectType, subjectId: r.subjectId, erase: true })}
                        className="rounded-lg px-2 py-1 text-xs text-muted hover:text-danger"
                      >
                        anonimizar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-faint">
            Ações de exportação e anonimização também podem ser feitas pelo titular selecionado acima e ficam registradas na auditoria.
          </p>
        </div>
      </Card>
    </div>
  );
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELED: 'Cancelada',
};

function PlanTab() {
  const qc = useQueryClient();
  const { data: subscription } = useQuery({ queryKey: ['billing-subscription'], queryFn: () => api.get<any>('/api/billing/subscription') });
  const { data: invoices } = useQuery({ queryKey: ['billing-invoices'], queryFn: () => api.get<any[]>('/api/billing/invoices') });
  const [mocked, setMocked] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['billing-subscription'] });
    qc.invalidateQueries({ queryKey: ['billing-invoices'] });
  };

  const checkout = useMutation({
    mutationFn: (planCode: string) => api.post<any>('/api/billing/checkout', { planCode, billingType: 'PIX' }),
    onSuccess: (res) => {
      invalidate();
      setMocked(!!res?.mocked);
      toast.success(res?.mocked ? 'Plano ativado (modo simulado)' : 'Assinatura criada');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () => api.post<any>('/api/billing/cancel'),
    onSuccess: () => {
      invalidate();
      toast.success('Assinatura cancelada');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const current = subscription?.planCode ?? 'trial';

  return (
    <div className="space-y-6">
      <Card glow={false}>
        <CardHeader
          title="Seu plano"
          subtitle={mocked ? 'Cobrança em modo simulado (defina ASAAS_API_KEY para cobrar de verdade)' : 'Assinatura gerenciada pelo Asaas'}
          action={
            subscription && (
              <Badge color={subscription.status === 'ACTIVE' ? '#8FBF9F' : subscription.status === 'PAST_DUE' ? '#C98B8B' : undefined}>
                {SUBSCRIPTION_STATUS_LABELS[subscription.status as keyof typeof SUBSCRIPTION_STATUS_LABELS] ?? subscription.status}
              </Badge>
            )
          }
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-6 text-sm text-muted">
          <span>
            Plano atual: <strong className="text-fg capitalize">{current}</strong>
          </span>
          {subscription?.currentPeriodEnd && <span>Renova em {formatDate(subscription.currentPeriodEnd)}</span>}
          {subscription?.trialEndsAt && subscription?.status === 'TRIAL' && <span>Teste até {formatDate(subscription.trialEndsAt)}</span>}
          {subscription?.status === 'CANCELED' && (
            <span className="text-faint">Assinatura cancelada — recursos pagos desativados.</span>
          )}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.code === current;
          return (
            <Card key={plan.code} glow={false} className={isCurrent ? 'ring-1 ring-success/40' : undefined}>
              <div className="space-y-4 p-6">
                <div>
                  <p className="text-eyebrow uppercase text-faint">{plan.name}</p>
                  <p className="mt-1 text-2xl font-semibold text-fg">
                    {plan.priceCents === 0 ? 'Grátis' : brl(plan.priceCents / 100)}
                    {plan.priceCents > 0 && <span className="text-sm font-normal text-faint">/mês</span>}
                  </p>
                  <p className="text-xs text-faint">Até {plan.maxUsers} usuários</p>
                </div>
                <ul className="space-y-1.5 text-xs text-muted">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <Check size={13} className="text-success" /> {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <Button variant="ghost" disabled className="w-full">
                    Plano atual
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    disabled={plan.priceCents === 0 || checkout.isPending}
                    onClick={() => checkout.mutate(plan.code)}
                  >
                    <CreditCard size={14} /> {plan.priceCents === 0 ? 'Indisponível' : 'Assinar'}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card glow={false}>
        <CardHeader
          title="Faturas"
          subtitle="Histórico de cobranças"
          action={
            subscription?.status === 'ACTIVE' && (
              <Button variant="danger" onClick={() => confirm('Cancelar a assinatura?') && cancel.mutate()} disabled={cancel.isPending}>
                Cancelar assinatura
              </Button>
            )
          }
        />
        {(invoices ?? []).length === 0 ? (
          <EmptyState title="Nenhuma fatura emitida" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-eyebrow uppercase text-faint">
                <th className="px-6 py-3 font-medium">Valor</th>
                <th className="px-6 py-3 font-medium">Vencimento</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(invoices ?? []).map((inv) => (
                <tr key={inv.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-3 text-fg">{brl(inv.valueCents / 100)}</td>
                  <td className="px-6 py-3 text-muted">{inv.dueDate ? formatDate(inv.dueDate) : '—'}</td>
                  <td className="px-6 py-3">
                    <Badge color={inv.status === 'PAID' ? '#8FBF9F' : inv.status === 'OVERDUE' ? '#C98B8B' : undefined}>
                      {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    {inv.invoiceUrl && (
                      <a href={inv.invoiceUrl} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-fg">
                        ver fatura
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function ApiKeysTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canCreate = user && can(user.role as any, 'config', 'create');
  const canDelete = user && can(user.role as any, 'config', 'delete');
  const { data: keys } = useQuery({ queryKey: ['api-keys'], queryFn: () => api.get<any[]>('/api/api-keys') });
  const [form, setForm] = useState({ name: '', scopes: ['read', 'write'] as string[] });
  const [secret, setSecret] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post<any>('/api/api-keys', form),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setForm({ name: '', scopes: ['read', 'write'] });
      setSecret(data.secret);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/api/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('Chave revogada');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleScope = (scope: string) =>
    setForm((f) => ({ ...f, scopes: f.scopes.includes(scope) ? f.scopes.filter((s) => s !== scope) : [...f.scopes, scope] }));

  return (
    <div className="space-y-6">
      <Card glow={false}>
        <CardHeader title="Chaves de API" subtitle="Acesso programático à API pública (/api/v1)" />
        <div className="space-y-4 p-6">
          {canCreate && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
              className="flex flex-wrap items-end gap-3"
            >
              <div className="min-w-[14rem] flex-1">
                <Field label="Nome da chave">
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Integração Zapier" />
                </Field>
              </div>
              <div className="flex items-end gap-3 pb-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" checked={form.scopes.includes('read')} onChange={() => toggleScope('read')} /> leitura
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" checked={form.scopes.includes('write')} onChange={() => toggleScope('write')} /> escrita
                </label>
              </div>
              <Button type="submit" disabled={create.isPending || form.scopes.length === 0}>
                <KeyRound size={14} /> Gerar chave
              </Button>
            </form>
          )}

          {(keys ?? []).length === 0 ? (
            <EmptyState title="Nenhuma chave de API" />
          ) : (
            <div className="divide-y divide-white/5 rounded-xl border border-white/5">
              {(keys ?? []).map((k) => (
                <div key={k.id} className="flex items-center gap-3 px-4 py-3">
                  <KeyRound size={16} className={k.revokedAt ? 'text-faint' : 'text-success'} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm', k.revokedAt ? 'text-faint line-through' : 'text-fg')}>{k.name}</p>
                    <p className="font-mono text-xs text-faint">
                      {k.preview} · {k.scopes.join(', ')}
                      {k.lastUsedAt ? ` · usado ${formatDate(k.lastUsedAt, true)}` : ' · nunca usado'}
                    </p>
                  </div>
                  <Badge color={k.revokedAt ? undefined : '#8FBF9F'}>{k.revokedAt ? 'Revogada' : 'Ativa'}</Badge>
                  {canDelete && !k.revokedAt && (
                    <button
                      onClick={() => confirm(`Revogar a chave ${k.name}?`) && revoke.mutate(k.id)}
                      className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                      title="Revogar"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-faint">
            Envie a chave no cabeçalho <code className="rounded bg-white/5 px-1">x-api-key</code>. Limite padrão de 120 requisições por minuto por chave.
          </p>
        </div>
      </Card>

      <Modal open={!!secret} onClose={() => setSecret(null)} title="Chave criada">
        <div className="space-y-4">
          <p className="text-xs text-muted">Copie e guarde agora — o segredo não será exibido novamente.</p>
          <div className="flex items-center gap-2">
            <Input readOnly value={secret ?? ''} className="font-mono text-xs" />
            <Button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(secret ?? '').catch(() => undefined);
                toast.success('Chave copiada');
              }}
            >
              <Copy size={14} /> Copiar
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setSecret(null)}>
              Fechar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const METRIC_OPTIONS = [
  { value: 'revenue', label: 'Receita (R$)' },
  { value: 'deals', label: 'Negócios ganhos' },
  { value: 'activities', label: 'Atividades' },
];

const CUSTOM_ENTITY_TYPES = ['Contact', 'Company', 'Deal', 'Lead'];
const CUSTOM_FIELD_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção' },
  { value: 'boolean', label: 'Sim/Não' },
];

function CrmSettingsTab() {
  return (
    <div className="space-y-6">
      <ProductsCard />
      <GoalsCard />
      <AutomationsCard />
      <CustomFieldsCard />
    </div>
  );
}

function ProductsCard() {
  const qc = useQueryClient();
  const { data: products } = useQuery({ queryKey: ['products-all'], queryFn: () => api.get<any[]>('/api/crm/products?includeInactive=true') });
  const [form, setForm] = useState({ name: '', sku: '', price: '' });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['products-all'] });
    qc.invalidateQueries({ queryKey: ['products'] });
  };

  const create = useMutation({
    mutationFn: () => api.post('/api/crm/products', { name: form.name, sku: form.sku || null, price: Number(form.price) || 0 }),
    onSuccess: () => {
      invalidate();
      setForm({ name: '', sku: '', price: '' });
      toast.success('Produto criado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch(`/api/crm/products/${id}`, data),
    onSuccess: () => {
      invalidate();
      toast.success('Produto atualizado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/crm/products/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Produto desativado');
    },
  });

  return (
    <Card glow={false}>
      <CardHeader title="Catálogo de produtos" subtitle="Itens disponíveis para compor negócios" />
      <div className="space-y-4 p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[12rem] flex-1">
            <Field label="Nome">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
          </div>
          <div className="w-32">
            <Field label="SKU">
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </Field>
          </div>
          <div className="w-32">
            <Field label="Preço (R$)">
              <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </Field>
          </div>
          <Button type="submit" disabled={create.isPending}>
            <Plus size={14} /> Adicionar
          </Button>
        </form>

        {(products ?? []).length === 0 ? (
          <EmptyState title="Nenhum produto cadastrado" />
        ) : (
          <div className="divide-y divide-white/5 rounded-xl border border-white/5">
            {(products ?? []).map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Package size={16} className="text-muted" />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm', p.active ? 'text-fg' : 'text-faint line-through')}>{p.name}</p>
                  {p.sku && <p className="text-xs text-faint">SKU {p.sku}</p>}
                </div>
                <span className="text-sm text-muted">R$ {Number(p.price).toFixed(2)}</span>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={p.active}
                    onChange={(e) => update.mutate({ id: p.id, active: e.target.checked })}
                  />
                  ativo
                </label>
                <button
                  onClick={() => confirm(`Desativar ${p.name}?`) && remove.mutate(p.id)}
                  className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                  title="Desativar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function GoalsCard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: goals } = useQuery({ queryKey: ['goals'], queryFn: () => api.get<any[]>('/api/crm/goals') });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get<any[]>('/api/users'), retry: false });
  const [form, setForm] = useState({ metric: 'revenue', target: '', periodStart: '', periodEnd: '', ownerId: '' });

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/crm/goals', {
        ...form,
        target: Number(form.target),
        ownerId: form.ownerId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['my-day'] });
      setForm({ metric: 'revenue', target: '', periodStart: '', periodEnd: '', ownerId: '' });
      toast.success('Meta criada');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/crm/goals/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['my-day'] });
      toast.success('Meta removida');
    },
  });

  return (
    <Card glow={false}>
      <CardHeader title="Metas" subtitle="Objetivos por responsável e período" />
      <div className="space-y-4 p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="w-40">
            <Field label="Métrica">
              <Select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
                {METRIC_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-32">
            <Field label="Alvo">
              <Input type="number" required step="0.01" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
            </Field>
          </div>
          <div className="w-40">
            <Field label="Início">
              <Input type="date" required value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
            </Field>
          </div>
          <div className="w-40">
            <Field label="Fim">
              <Input type="date" required value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
            </Field>
          </div>
          {users && users.length > 0 && (
            <div className="w-44">
              <Field label="Responsável">
                <Select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                  <option value="">{user?.name ?? 'Eu'}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          <Button type="submit" disabled={create.isPending}>
            <Target size={14} /> Criar meta
          </Button>
        </form>

        {(goals ?? []).length === 0 ? (
          <EmptyState title="Nenhuma meta definida" />
        ) : (
          <div className="divide-y divide-white/5 rounded-xl border border-white/5">
            {(goals ?? []).map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                <Target size={16} className="text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">
                    {METRIC_OPTIONS.find((m) => m.value === g.metric)?.label ?? g.metric}: {Number(g.target).toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-faint">
                    {g.owner?.name ?? '—'} · {formatDate(g.periodStart)} – {formatDate(g.periodEnd)}
                  </p>
                </div>
                <button
                  onClick={() => confirm('Remover esta meta?') && remove.mutate(g.id)}
                  className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                  title="Remover"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

const AUTOMATION_TRIGGER_OPTIONS = [
  { value: 'DEAL_CREATED', label: 'Negócio criado' },
  { value: 'DEAL_STAGE_CHANGED', label: 'Mudança de etapa' },
  { value: 'DEAL_WON', label: 'Negócio ganho' },
  { value: 'DEAL_LOST', label: 'Negócio perdido' },
];

const AUTOMATION_ACTION_OPTIONS = [
  { value: 'NOTIFY_OWNER', label: 'Notificar responsável' },
  { value: 'NOTIFY_USER', label: 'Notificar usuário' },
  { value: 'CREATE_ACTIVITY', label: 'Criar atividade' },
  { value: 'CREATE_TASK', label: 'Criar tarefa' },
];

const ACTIVITY_TYPE_OPTIONS = [
  { value: 'CALL', label: 'Ligação' },
  { value: 'MEETING', label: 'Reunião' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'VISIT', label: 'Visita' },
  { value: 'NOTE', label: 'Nota' },
];

function AutomationsCard() {
  const qc = useQueryClient();
  const { data: rules } = useQuery({ queryKey: ['automations'], queryFn: () => api.get<any[]>('/api/automations') });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get<any[]>('/api/users'), retry: false });
  const { data: pipelines } = useQuery({ queryKey: ['pipelines'], queryFn: () => api.get<any[]>('/api/crm/pipelines') });
  const { data: boards } = useQuery({ queryKey: ['boards'], queryFn: () => api.get<any[]>('/api/boards'), retry: false });

  const empty = { name: '', trigger: 'DEAL_CREATED', action: 'NOTIFY_OWNER', stageId: '', minAmount: '', title: '', body: '', userId: '', type: 'CALL', dueInDays: '', boardId: '' };
  const [form, setForm] = useState(empty);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['automations'] });

  const create = useMutation({
    mutationFn: () => {
      const conditions: Record<string, unknown> = {};
      if (form.stageId) conditions.stageId = form.stageId;
      if (form.minAmount) conditions.minAmount = Number(form.minAmount);

      const actionConfig: Record<string, unknown> = {};
      if (form.action === 'NOTIFY_OWNER' || form.action === 'NOTIFY_USER') {
        if (form.title) actionConfig.title = form.title;
        if (form.body) actionConfig.body = form.body;
        if (form.action === 'NOTIFY_USER') actionConfig.userId = form.userId || undefined;
      }
      if (form.action === 'CREATE_ACTIVITY') {
        actionConfig.type = form.type;
        if (form.title) actionConfig.subject = form.title;
        if (form.body) actionConfig.body = form.body;
        if (form.dueInDays) actionConfig.dueInDays = Number(form.dueInDays);
      }
      if (form.action === 'CREATE_TASK') {
        if (form.title) actionConfig.title = form.title;
        if (form.body) actionConfig.description = form.body;
        if (form.dueInDays) actionConfig.dueInDays = Number(form.dueInDays);
        if (form.boardId) actionConfig.boardId = form.boardId;
      }

      return api.post('/api/automations', { name: form.name, trigger: form.trigger, action: form.action, conditions, actionConfig });
    },
    onSuccess: () => {
      invalidate();
      setForm(empty);
      toast.success('Automação criada');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => api.post(`/api/automations/${id}/toggle`),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/automations/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Automação removida');
    },
  });

  const stages = (pipelines ?? []).flatMap((p: any) => (p.stages ?? []).map((s: any) => ({ id: s.id, label: `${p.name} › ${s.name}` })));

  const triggerLabel = (v: string) => AUTOMATION_TRIGGER_OPTIONS.find((o) => o.value === v)?.label ?? v;
  const actionLabel = (v: string) => AUTOMATION_ACTION_OPTIONS.find((o) => o.value === v)?.label ?? v;

  return (
    <Card glow={false}>
      <CardHeader title="Automações" subtitle="Ações disparadas automaticamente por eventos do CRM" />
      <div className="space-y-4 p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-3"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <Field label="Nome">
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Avisar responsável ao ganhar" />
              </Field>
            </div>
            <div className="w-44">
              <Field label="Quando (gatilho)">
                <Select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}>
                  {AUTOMATION_TRIGGER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-48">
              <Field label="Então (ação)">
                <Select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
                  {AUTOMATION_ACTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {stages.length > 0 && (
              <div className="w-56">
                <Field label="Condição: etapa" hint="Opcional">
                  <Select value={form.stageId} onChange={(e) => setForm({ ...form, stageId: e.target.value })}>
                    <option value="">Qualquer etapa</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            <div className="w-40">
              <Field label="Condição: valor mín. (R$)" hint="Opcional">
                <Input type="number" step="0.01" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} />
              </Field>
            </div>
            {form.action === 'NOTIFY_USER' && (
              <div className="w-48">
                <Field label="Destinatário">
                  <Select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                    <option value="">Selecione…</option>
                    {(users ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            {form.action === 'CREATE_ACTIVITY' && (
              <div className="w-40">
                <Field label="Tipo de atividade">
                  <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {ACTIVITY_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            {form.action === 'CREATE_TASK' && (boards ?? []).length > 0 && (
              <div className="w-48">
                <Field label="Quadro" hint="Padrão: o primeiro">
                  <Select value={form.boardId} onChange={(e) => setForm({ ...form, boardId: e.target.value })}>
                    <option value="">Primeiro quadro</option>
                    {(boards ?? []).map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {form.action !== 'NOTIFY_USER' && (
              <div className="min-w-[14rem] flex-1">
                <Field label={form.action === 'CREATE_ACTIVITY' ? 'Assunto' : 'Título'} hint="Use {{title}} para o nome do negócio">
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </Field>
              </div>
            )}
            <div className="min-w-[14rem] flex-1">
              <Field label="Descrição" hint="Opcional">
                <Input value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              </Field>
            </div>
            {(form.action === 'CREATE_ACTIVITY' || form.action === 'CREATE_TASK') && (
              <div className="w-36">
                <Field label="Prazo (dias)" hint="Opcional">
                  <Input type="number" min={0} value={form.dueInDays} onChange={(e) => setForm({ ...form, dueInDays: e.target.value })} />
                </Field>
              </div>
            )}
            <Button type="submit" disabled={create.isPending}>
              <Zap size={14} /> Criar automação
            </Button>
          </div>
        </form>

        {(rules ?? []).length === 0 ? (
          <EmptyState title="Nenhuma automação configurada" />
        ) : (
          <div className="divide-y divide-white/5 rounded-xl border border-white/5">
            {(rules ?? []).map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Zap size={16} className={cn(r.enabled ? 'text-success' : 'text-faint')} />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm', r.enabled ? 'text-fg' : 'text-faint line-through')}>{r.name}</p>
                  <p className="text-xs text-faint">
                    {triggerLabel(r.trigger)} → {actionLabel(r.action)}
                    {r.runCount > 0 && ` · executada ${r.runCount}x`}
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" checked={r.enabled} onChange={() => toggle.mutate(r.id)} />
                  ativa
                </label>
                <button
                  onClick={() => confirm(`Remover a automação ${r.name}?`) && remove.mutate(r.id)}
                  className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                  title="Remover"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function CustomFieldsCard() {
  const qc = useQueryClient();
  const { data: fields } = useQuery({ queryKey: ['custom-fields'], queryFn: () => api.get<any[]>('/api/crm/custom-fields') });
  const [form, setForm] = useState({ entityType: 'Contact', label: '', type: 'text', choices: '' });

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/crm/custom-fields', {
        entityType: form.entityType,
        label: form.label,
        type: form.type,
        options: form.type === 'select' ? { choices: form.choices.split(',').map((c) => c.trim()).filter(Boolean) } : {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      setForm({ entityType: 'Contact', label: '', type: 'text', choices: '' });
      toast.success('Campo criado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/crm/custom-fields/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success('Campo removido');
    },
  });

  const typeLabel = (t: string) => CUSTOM_FIELD_TYPES.find((x) => x.value === t)?.label ?? t;

  return (
    <Card glow={false}>
      <CardHeader title="Campos personalizados" subtitle="Informações extras nos registros do CRM" />
      <div className="space-y-4 p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="w-36">
            <Field label="Entidade">
              <Select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
                {CUSTOM_ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="min-w-[10rem] flex-1">
            <Field label="Rótulo">
              <Input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </Field>
          </div>
          <div className="w-32">
            <Field label="Tipo">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {CUSTOM_FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {form.type === 'select' && (
            <div className="min-w-[12rem] flex-1">
              <Field label="Opções" hint="Separe por vírgula">
                <Input value={form.choices} onChange={(e) => setForm({ ...form, choices: e.target.value })} />
              </Field>
            </div>
          )}
          <Button type="submit" disabled={create.isPending}>
            <SlidersHorizontal size={14} /> Adicionar
          </Button>
        </form>

        {(fields ?? []).length === 0 ? (
          <EmptyState title="Nenhum campo personalizado" />
        ) : (
          <div className="divide-y divide-white/5 rounded-xl border border-white/5">
            {(fields ?? []).map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                <SlidersHorizontal size={16} className="text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{f.label}</p>
                  <p className="text-xs text-faint">
                    {f.entityType} · {typeLabel(f.type)}
                  </p>
                </div>
                <button
                  onClick={() => confirm(`Remover campo ${f.label}?`) && remove.mutate(f.id)}
                  className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                  title="Remover"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
