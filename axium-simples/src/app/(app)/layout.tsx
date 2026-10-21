import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { AppShell } from '@/components/layout/app-shell';
import { SetupNotice } from '@/components/layout/setup-notice';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const name =
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name) ||
    user.email?.split('@')[0] ||
    'Usuário';

  return (
    <AppShell name={name} email={user.email ?? ''}>
      {children}
    </AppShell>
  );
}
