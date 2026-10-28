import { Database, HardDrive } from 'lucide-react';
import { Card, Eyebrow } from '@/components/ui';
import type { DbError } from '@/lib/use-supabase-query';

/**
 * Aviso exibido quando as tabelas ainda não existem no Supabase.
 * O SQL fica em `supabase/migrations/0001_init.sql`.
 */
export function SchemaSetupNotice({ error }: { error: DbError }) {
  return (
    <Card glow={false} className="mx-6 mb-6 border-warning/30 lg:mx-8">
      <div className="flex items-start gap-4 p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-warning/30 bg-warning/10 text-warning">
          <Database size={18} strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <Eyebrow className="text-warning">Banco ainda não configurado</Eyebrow>
          <p className="mt-1 text-sm font-semibold text-fg">Execute o SQL inicial no Supabase</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Abra o <span className="text-fg">SQL Editor</span> do projeto e cole o conteúdo de{' '}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-fg">
              supabase/migrations/0001_init.sql
            </code>
            . Ele cria as tabelas, as policies de RLS e o bucket de arquivos.
          </p>
          {error?.message && (
            <p className="mt-2 truncate text-[11px] text-faint">Detalhe: {error.message}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Aviso exibido quando o bucket "arquivos" não existe. */
export function BucketSetupNotice({ error }: { error: DbError }) {
  return (
    <Card glow={false} className="border-warning/30">
      <div className="flex items-start gap-4 p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-warning/30 bg-warning/10 text-warning">
          <HardDrive size={18} strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <Eyebrow className="text-warning">Storage ainda não configurado</Eyebrow>
          <p className="mt-1 text-sm font-semibold text-fg">Crie o bucket privado &quot;arquivos&quot;</p>
          <p className="mt-1 text-xs text-muted-foreground">
            O SQL inicial já cria o bucket e as policies. Se você rodou o SQL antes, rode novamente a
            parte de Storage em <span className="text-fg">supabase/migrations/0001_init.sql</span>.
          </p>
          {error?.message && (
            <p className="mt-2 truncate text-[11px] text-faint">Detalhe: {error.message}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
