'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input } from '@/components/ui';
import { Logo } from '@/components/layout/logo';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', password: '' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });

      if (signInError) {
        setError(friendlyError(signInError.message));
        return;
      }

      router.replace(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/5 bg-surface p-12 lg:flex">
        <div className="surface-glow absolute inset-0" />
        <div className="relative flex items-center gap-3">
          <Logo size={18} className="rounded-xl" />
          <span className="text-lg font-extrabold tracking-tight">AXIUM</span>
        </div>

        <div className="relative max-w-md space-y-5">
          <p className="text-eyebrow uppercase text-faint">Sistema interno</p>
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight">
            CRM, agenda, rotina, tarefas e arquivos em um só lugar.
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Tudo o que a operação da empresa precisa para vender com consistência — sem complicação e
            sem planos.
          </p>
        </div>

        <p className="relative text-xs text-faint">AXIUM — uso interno</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={18} className="rounded-xl" />
            <span className="text-lg font-extrabold tracking-tight">AXIUM</span>
          </div>

          <p className="text-eyebrow uppercase text-faint">Acessar</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Entrar no sistema</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use o e-mail e a senha fornecidos pelo administrador.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="E-mail">
              <Input
                type="email"
                required
                autoComplete="email"
                placeholder="voce@empresa.com.br"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>

            <Field label="Senha">
              <Input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>

            {error && (
              <p className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full justify-between" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
              <ArrowRight size={16} />
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            O cadastro é feito pelo administrador no painel do Supabase.
          </p>
        </div>
      </div>
    </div>
  );
}

function friendlyError(message: string) {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou senha inválidos.';
  if (/email not confirmed/i.test(message)) return 'E-mail ainda não confirmado.';
  if (/rate limit|too many/i.test(message)) return 'Muitas tentativas. Aguarde um instante.';
  return 'Não foi possível entrar. Tente novamente.';
}
