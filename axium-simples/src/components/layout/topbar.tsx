'use client';

import { LogOut, Menu } from 'lucide-react';
import { logout } from '@/lib/auth-actions';
import { Avatar } from '@/components/ui';

export function Topbar({
  name,
  email,
  onOpenMenu,
}: {
  name: string;
  email: string;
  onOpenMenu: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/5 bg-surface px-4 lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-fg lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu size={18} />
      </button>

      <p className="hidden text-xs uppercase tracking-[0.12em] text-faint lg:block">AXIUM Interno</p>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-xs font-medium text-fg">{name || email}</p>
          <p className="text-[11px] text-faint">{email}</p>
        </div>
        <Avatar name={name || email} size={32} />
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-fg"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </form>
      </div>
    </header>
  );
}
