import { isSupabaseConfigured } from '@/lib/supabase/env';
import { SetupNotice } from '@/components/layout/setup-notice';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const params = await searchParams;
  const next = params.redirect?.startsWith('/') ? params.redirect : '/dashboard';

  return <LoginForm next={next} />;
}
