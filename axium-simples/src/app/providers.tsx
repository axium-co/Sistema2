'use client';

import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'rgb(var(--elevated))',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgb(var(--foreground))',
          },
        }}
      />
    </>
  );
}
