'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Search,
  Plus,
  LogOut,
  Menu,
  Building2,
  Users,
  Target,
  CalendarPlus,
  SquareKanban,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, useAuth } from '@/lib/api';
import { Avatar, Badge, Button } from '@/components/ui';
import { cn, formatDate } from '@/lib/utils';

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [openSearch, setOpenSearch] = useState(false);
  const [openNotifs, setOpenNotifs] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: search } = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<{ results: any[] }>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });

  const { data: notifs } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<any[]>('/api/notifications'),
    refetchInterval: 30_000,
  });

  const unread = (notifs ?? []).filter((n) => !n.read).length;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpenSearch(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpenSearch(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function markAllRead() {
    await api.post('/api/notifications/read-all');
    qc.invalidateQueries({ queryKey: ['notifications'] });
  }

  function go(url: string) {
    setOpenSearch(false);
    setQ('');
    router.push(url);
  }

  return (
    <header className="flex h-16 items-center gap-3 border-b border-white/5 bg-surface px-4 lg:px-6">
      <button onClick={onOpenMenu} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-fg lg:hidden">
        <Menu size={18} />
      </button>

      <div ref={searchRef} className="relative flex-1 max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpenSearch(true);
          }}
          onFocus={() => setOpenSearch(true)}
          placeholder="Buscar…  (Ctrl+K)"
          className="h-9 w-full rounded-full border border-white/10 bg-bg pl-9 pr-3 text-sm text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-white/15"
        />
        {openSearch && search?.results?.length ? (
          <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-2xl border border-white/10 bg-elevated shadow-drag animate-fade-in">
            {search.results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => go(r.url)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5"
              >
                <span className="truncate text-fg">{r.title}</span>
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-faint">{r.type}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="relative">
          <Button size="sm" onClick={() => setOpenCreate((v) => !v)} className="gap-1.5">
            <Plus size={14} /> Criar
          </Button>
          {openCreate && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpenCreate(false)} />
              <div className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-2xl border border-white/10 bg-elevated py-1 animate-fade-in">
                {[
                  { label: 'Novo negócio', icon: Target, href: '/crm/negocios?novo=1' },
                  { label: 'Novo contato', icon: Users, href: '/crm/contatos?novo=1' },
                  { label: 'Nova empresa', icon: Building2, href: '/crm/empresas?novo=1' },
                  { label: 'Novo compromisso', icon: CalendarPlus, href: '/agenda?novo=1' },
                  { label: 'Nova tarefa', icon: SquareKanban, href: '/tarefas?novo=1' },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setOpenCreate(false);
                      router.push(item.href);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-muted hover:bg-white/5 hover:text-fg"
                  >
                    <item.icon size={15} strokeWidth={1.6} />
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setOpenNotifs((v) => !v)}
            className="relative rounded-full p-2 text-muted hover:bg-white/5 hover:text-fg"
          >
            <Bell size={18} strokeWidth={1.6} />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-bg">
                {unread}
              </span>
            )}
          </button>
          {openNotifs && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpenNotifs(false)} />
              <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-2xl border border-white/10 bg-elevated animate-fade-in">
                <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                  <span className="text-sm font-semibold">Notificações</span>
                  <button onClick={markAllRead} className="text-[11px] text-muted hover:text-fg">
                    marcar todas como lidas
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {(notifs ?? []).length === 0 && <p className="px-4 py-6 text-center text-xs text-faint">Nada por aqui.</p>}
                  {(notifs ?? []).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        api.post(`/api/notifications/${n.id}/read`);
                        setOpenNotifs(false);
                        if (n.url) router.push(n.url);
                        qc.invalidateQueries({ queryKey: ['notifications'] });
                      }}
                      className={cn('flex w-full flex-col gap-0.5 border-b border-white/5 px-4 py-3 text-left hover:bg-white/5', !n.read && 'bg-white/[0.02]')}
                    >
                      <span className="text-sm text-fg">{n.title}</span>
                      {n.body && <span className="text-xs text-muted">{n.body}</span>}
                      <span className="text-[11px] text-faint">{formatDate(n.createdAt, true)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button onClick={() => setOpenProfile((v) => !v)} className="ml-1 rounded-full">
            <Avatar name={user?.name ?? '?'} url={user?.avatarUrl} size={32} />
          </button>
          {openProfile && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpenProfile(false)} />
              <div className="absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-2xl border border-white/10 bg-elevated animate-fade-in">
                <div className="border-b border-white/5 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-fg">{user?.name}</p>
                  <p className="truncate text-xs text-muted">{user?.email}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge>{user?.role}</Badge>
                    {user?.tenant && <Badge>{user.tenant.name}</Badge>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setOpenProfile(false);
                    router.push('/configuracoes');
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-muted hover:bg-white/5 hover:text-fg"
                >
                  Configurações
                </button>
                <button
                  onClick={async () => {
                    try {
                      await api.post('/api/auth/logout', {});
                    } catch {}
                    logout();
                    toast.success('Sessão encerrada');
                    router.push('/login');
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-danger hover:bg-danger/10"
                >
                  <LogOut size={15} strokeWidth={1.6} /> Sair
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
