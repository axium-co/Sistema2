'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api, useAuth, type AuthUser } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';

interface Preview {
  email: string;
  name: string | null;
  role: string;
  tenantName: string;
  valid: boolean;
  expired: boolean;
  used: boolean;
}

export default function ConvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Validando convite…
          </div>
        </div>
      }
    >
      <ConviteForm />
    </Suspense>
  );
}

function ConviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const setSession = useAuth((s) => s.setSession);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', password: '' });

  useEffect(() => {
    if (!token) {
      setError('Convite inválido: token ausente.');
      setLoading(false);
      return;
    }
    api
      .get<Preview>(`/api/users/invitations/preview?token=${encodeURIComponent(token)}`)
      .then((data) => {
        setPreview(data);
        setForm((f) => ({ ...f, name: data.name ?? '' }));
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser; tenant: AuthUser['tenant'] }>('/api/users/invitations/accept', {
        token,
        name: form.name || undefined,
        password: form.password,
      });
      setSession({ ...data, user: { ...data.user, tenant: data.tenant } });
      toast.success(`Bem-vindo(a) à ${preview?.tenantName ?? 'equipe'}!`);
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-in">
        <p className="text-eyebrow uppercase text-faint">Convite</p>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Validando convite…
          </div>
        ) : error ? (
          <div className="mt-3 space-y-4">
            <h2 className="text-2xl font-extrabold tracking-tight">Convite indisponível</h2>
            <p className="flex items-center gap-2 text-sm text-muted">
              <ShieldAlert size={15} className="text-danger" /> {error}
            </p>
            <Link href="/login" className="inline-block text-sm font-medium text-fg underline-offset-4 hover:underline">
              Ir para o login
            </Link>
          </div>
        ) : preview && !preview.valid ? (
          <div className="mt-3 space-y-4">
            <h2 className="text-2xl font-extrabold tracking-tight">Convite indisponível</h2>
            <p className="text-sm text-muted">
              {preview.expired ? 'Este convite expirou.' : preview.used ? 'Este convite já foi utilizado.' : 'Este convite não está mais ativo.'}
            </p>
            <Link href="/login" className="inline-block text-sm font-medium text-fg underline-offset-4 hover:underline">
              Ir para o login
            </Link>
          </div>
        ) : (
          <>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Entrar na {preview?.tenantName}</h2>
            <p className="mt-1 text-sm text-muted">Você foi convidado(a) para participar da equipe no AXIUM.</p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              <Field label="E-mail">
                <Input value={preview?.email ?? ''} disabled />
              </Field>
              <Field label="Seu nome">
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Como devemos te chamar" />
              </Field>
              <Field label="Crie uma senha" hint="Mínimo 8 caracteres">
                <Input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
              <Button type="submit" size="lg" className="w-full justify-between" disabled={submitting}>
                {submitting ? 'Criando conta…' : 'Aceitar convite'}
                <ArrowRight size={16} />
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
