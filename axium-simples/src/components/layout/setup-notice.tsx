import { Card, CardHeader, Eyebrow } from '@/components/ui';
import { Logo } from '@/components/layout/logo';

export function SetupNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <div className="surface-glow" />
        <div className="relative p-8">
          <div className="flex items-center gap-3">
            <Logo size={18} />
            <span className="text-lg font-extrabold tracking-tight">AXIUM</span>
          </div>

          <Eyebrow className="mt-8">Configuração pendente</Eyebrow>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Conecte o seu Supabase</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            As variáveis de ambiente ainda não foram definidas. Crie o arquivo{' '}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-fg">.env.local</code> na
            raiz do projeto com:
          </p>

          <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-surface p-4 text-[11px] leading-relaxed text-muted-foreground">
{`NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON`}
          </pre>

          <CardHeader
            title="Onde encontrar esses valores"
            subtitle="No painel do Supabase: Project Settings -> API"
            action={<span className="text-xs text-faint">1/2</span>}
          />
        </div>
      </Card>
    </div>
  );
}
