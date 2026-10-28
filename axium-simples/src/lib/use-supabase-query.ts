'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type DbError = { message: string; code?: string } | null;

type QueryResult<T> = PromiseLike<{ data: T | null; error: DbError }>;

/**
 * Executa uma consulta Supabase e expõe loading/erro/refresh.
 * A função `query` é lida sempre da renderização mais recente, então pode
 * capturar props/estado sem recriar o efeito.
 */
export function useSupabaseQuery<T>(query: () => QueryResult<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<DbError>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    let alive = true;
    setLoading(true);

    Promise.resolve(queryRef.current())
      .then((result) => {
        if (!alive) return;
        setData(result.data ?? null);
        setError(result.error ?? null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError({ message: err instanceof Error ? err.message : 'Erro ao carregar dados.' });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, refresh };
}

export function isMissingSchema(error: DbError) {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist|could not find the table|schema cache/i.test(error.message)
  );
}

export function isMissingColumn(error: DbError) {
  if (!error) return false;
  return error.code === '42703' || /column .* does not exist/i.test(error.message);
}

export function isMissingBucket(error: DbError) {
  if (!error) return false;
  return /bucket.*not found|bucket.*does not exist/i.test(error.message);
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Algo deu errado. Tente novamente.';
}
