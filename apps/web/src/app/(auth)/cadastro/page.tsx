'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { api, useAuth, type AuthUser } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ companyName: '', name: '', email: '', password: '' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser; tenant: AuthUser['tenant'] }>('/api/auth/register', form);
      setSession({ ...data, user: { ...data.user, tenant: data.tenant } });
      toast.success('Empresa criada com sucesso');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-elevated">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 4l16 16M20 4L4 20" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-lg font-extrabold tracking-tight">AXIUM</span>
        </div>

        <p className="text-eyebrow uppercase text-faint">Começar agora</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Criar sua empresa no AXIUM</h1>
        <p className="mt-1 text-sm text-muted">
          Criamos automaticamente seu funil de vendas, agenda e quadro de tarefas.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <Field label="Nome da empresa">
            <Input required minLength={2} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Ex.: Nexo Soluções" />
          </Field>
          <Field label="Seu nome">
            <Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" />
          </Field>
          <Field label="E-mail corporativo">
            <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="voce@empresa.com.br" />
          </Field>
          <Field label="Senha" hint="Mínimo de 8 caracteres">
            <Input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
          </Field>
          <Button type="submit" size="lg" className="w-full justify-between" disabled={loading}>
            {loading ? 'Criando…' : 'Criar empresa'}
            <ArrowRight size={16} />
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Já tem conta?{' '}
          <Link href="/login" className="font-medium text-fg underline-offset-4 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
