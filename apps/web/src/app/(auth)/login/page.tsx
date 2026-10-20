'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { api, useAuth, type AuthUser } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [challenge, setChallenge] = useState<{ challengeToken: string; email: string } | null>(null);
  const [code, setCode] = useState('');

  async function applySession(data: { accessToken: string; refreshToken: string; user: AuthUser; tenant: AuthUser['tenant'] }) {
    setSession({ ...data, user: { ...data.user, tenant: data.tenant } });
    toast.success(`Bem-vindo, ${data.user.name.split(' ')[0]}`);
    router.push('/dashboard');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post<any>('/api/auth/login', form);
      if (data?.twoFactorRequired) {
        setChallenge({ challengeToken: data.challengeToken, email: data.email });
        return;
      }
      await applySession(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setLoading(true);
    try {
      const data = await api.post<any>('/api/auth/2fa/verify', { challengeToken: challenge.challengeToken, code });
      await applySession(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/5 bg-surface p-12 lg:flex">
        <div className="surface-glow absolute inset-0" />
        <div className="relative flex items-center gap-3">
          <Mark />
          <span className="text-lg font-extrabold tracking-tight">AXIUM</span>
        </div>
        <div className="relative max-w-md space-y-5">
          <p className="text-eyebrow uppercase text-faint">Estruturação comercial</p>
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight">
            Pare de depender de indicação. Tenha uma agenda previsível.
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            CRM, agenda, rotina, tarefas e arquivos conectados em um único painel. Tudo o que a sua
            operação comercial precisa para vender com consistência.
          </p>
        </div>
        <p className="relative text-xs text-faint">AXIUM — estruturação comercial e agenda previsível</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Mark />
            <span className="text-lg font-extrabold tracking-tight">AXIUM</span>
          </div>
          <p className="text-eyebrow uppercase text-faint">{challenge ? 'Verificação em duas etapas' : 'Acessar'}</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight">
            {challenge ? 'Confirme seu identidade' : 'Entrar na plataforma'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {challenge
              ? `Digite o código de 6 dígitos do aplicativo autenticador de ${challenge.email}.`
              : 'Use suas credenciais corporativas.'}
          </p>

          {challenge ? (
            <form onSubmit={submitCode} className="mt-7 space-y-4">
              <Field label="Código de verificação">
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.4em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </Field>
              <Button type="submit" size="lg" className="w-full justify-between" disabled={loading || code.length !== 6}>
                {loading ? 'Verificando…' : 'Verificar'}
                <ArrowRight size={16} />
              </Button>
              <button
                type="button"
                onClick={() => {
                  setChallenge(null);
                  setCode('');
                }}
                className="w-full text-center text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
              >
                Voltar para o login
              </button>
            </form>
          ) : (
          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="E-mail">
              <Input
                type="email"
                required
                placeholder="voce@empresa.com.br"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Senha">
              <Input
                type="password"
                required
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Button type="submit" size="lg" className="w-full justify-between" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
              <ArrowRight size={16} />
            </Button>
          </form>
          )}

          <p className="mt-6 text-center text-xs text-muted">
            Ainda não tem conta?{' '}
            <Link href="/cadastro" className="font-medium text-fg underline-offset-4 hover:underline">
              Criar empresa no AXIUM
            </Link>
          </p>

          <div className="mt-8 rounded-2xl border border-white/5 bg-surface p-4 text-xs text-faint">
            <p className="mb-1 font-medium text-muted">Demonstração</p>
            <p>ana@nexo.com.br · axium123 (proprietária)</p>
            <p>bruno@nexo.com.br · axium123 (gerente)</p>
            <p>carla@nexo.com.br · axium123 (vendedora)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-elevated">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 4l16 16M20 4L4 20" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
