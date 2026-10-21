export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** true quando as duas variáveis do `.env.local` estão preenchidas. */
export function isSupabaseConfigured() {
  return /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length >= 20;
}
