'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  Target,
  Columns3,
  CalendarDays,
  KanbanSquare,
  FolderOpen,
  ListChecks,
  BarChart3,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/dashboard', label: 'Meu dia', icon: LayoutDashboard },
  { href: '/crm/pipelines', label: 'Funil de vendas', icon: Target },
  { href: '/crm/negocios', label: 'Negócios', icon: Columns3 },
  { href: '/crm/contatos', label: 'Contatos', icon: Users },
  { href: '/crm/empresas', label: 'Empresas', icon: Building2 },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays },
  { href: '/rotina', label: 'Rotina', icon: ListChecks },
  { href: '/tarefas', label: 'Tarefas', icon: KanbanSquare },
  { href: '/arquivos', label: 'Arquivos', icon: FolderOpen },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-elevated">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 4l16 16M20 4L4 20" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="text-sm font-extrabold tracking-tight">AXIUM</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
                active ? 'bg-white/5 text-fg' : 'text-muted hover:bg-white/5 hover:text-fg',
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
            pathname.startsWith('/configuracoes') ? 'bg-white/5 text-fg' : 'text-muted hover:bg-white/5 hover:text-fg',
          )}
        >
          <Settings size={17} strokeWidth={1.6} />
          Configurações
        </Link>
      </div>
    </div>
  );
}
