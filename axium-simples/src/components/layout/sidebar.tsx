'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  Settings,
  SquareKanban,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './logo';

const nav = [
  { href: '/dashboard', label: 'Meu dia', icon: LayoutDashboard },
  { href: '/crm', label: 'CRM', icon: Users },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays },
  { href: '/rotina', label: 'Rotina', icon: ListChecks },
  { href: '/tarefas', label: 'Tarefas', icon: SquareKanban },
  { href: '/arquivos', label: 'Arquivos', icon: FolderOpen },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
        <Logo size={16} />
        <span className="text-sm font-extrabold tracking-tight">AXIUM</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
                active ? 'bg-white/5 text-fg' : 'text-muted-foreground hover:bg-white/5 hover:text-fg',
              )}
            >
              <item.icon size={17} strokeWidth={1.6} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/5 p-3">
        <Link
          href="/configuracoes"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
            pathname.startsWith('/configuracoes')
              ? 'bg-white/5 text-fg'
              : 'text-muted-foreground hover:bg-white/5 hover:text-fg',
          )}
        >
          <Settings size={17} strokeWidth={1.6} />
          Configurações
        </Link>
      </div>
    </div>
  );
}
