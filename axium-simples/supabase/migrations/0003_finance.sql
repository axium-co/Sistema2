-- AXIUM Interno — setor financeiro (execute no SQL Editor do Supabase)
-- Idempotente: pode rodar mais de uma vez sem apagar dados.

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------
create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#7C9CBF',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Lançamentos (contas a pagar/receber e fluxo de caixa)
-- ---------------------------------------------------------------------------
create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('RECEITA', 'DESPESA')),
  description text not null,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  category_id uuid references public.finance_categories (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  deal_id uuid references public.deals (id) on delete set null,
  due_date date not null,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'PAGO', 'CANCELADO')),
  paid_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_entries_due_idx on public.finance_entries (due_date);
create index if not exists finance_entries_status_idx on public.finance_entries (status);
create index if not exists finance_entries_kind_idx on public.finance_entries (kind);
create index if not exists finance_entries_category_idx on public.finance_entries (category_id);

drop trigger if exists finance_entries_set_updated_at on public.finance_entries;
create trigger finance_entries_set_updated_at before update on public.finance_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — todo usuário autenticado tem acesso.
-- ---------------------------------------------------------------------------
alter table public.finance_categories enable row level security;
alter table public.finance_entries enable row level security;

drop policy if exists "authenticated_all" on public.finance_categories;
create policy "authenticated_all" on public.finance_categories
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on public.finance_entries;
create policy "authenticated_all" on public.finance_entries
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Categorias iniciais
-- ---------------------------------------------------------------------------
insert into public.finance_categories (name, color)
select seed.name, seed.color
from (
  values
    ('Vendas', '#8FBF9F'),
    ('Serviços', '#7C9CBF'),
    ('Marketing', '#A89BC9'),
    ('Operacional', '#BFA27C'),
    ('Impostos', '#C98B8B'),
    ('Outros', '#71717A')
) as seed (name, color)
where not exists (
  select 1 from public.finance_categories as category where category.name = seed.name
);

notify pgrst, 'reload schema';
