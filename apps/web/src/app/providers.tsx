'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { useAuth } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }));
  const load = useAuth((s) => s.load);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: { background: 'rgb(var(--elevated))', border: '1px solid rgba(255,255,255,0.1)', color: 'rgb(var(--fg))' },
        }}
      />
    </QueryClientProvider>
  );
}
