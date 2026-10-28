-- AXIUM Interno — schema inicial (execute no SQL Editor do Supabase)
-- Idempotente: pode rodar mais de uma vez sem apagar dados.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text,
  phone text,
  website text,
  address text,
  city text,
  state text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  whatsapp text,
  job_title text,
  source text,
  company_name text,
  company_cnpj text,
  company_website text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  name text not null,
  color text not null default '#71717A',
  position integer not null default 0,
  probability integer not null default 10
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  stage_id uuid not null references public.pipeline_stages (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  title text not null,
  amount numeric(14, 2) not null default 0,
  expected_close_date date,
  status text not null default 'ABERTO' check (status in ('ABERTO', 'GANHO', 'PERDIDO')),
  loss_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null default 'MEETING' check (type in ('MEETING', 'CALL', 'VISIT', 'FOLLOWUP', 'REMINDER', 'BLOCK')),
  color text not null default '#7C9CBF',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'TENTATIVE', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tarefas (quadros)
-- ---------------------------------------------------------------------------
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_lists (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  name text not null,
  position numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  list_id uuid not null references public.board_lists (id) on delete cascade,
  title text not null,
  description text not null default '',
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  due_date timestamptz,
  position numeric not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Arquivos (metadados; o binário fica no Storage, bucket "arquivos")
-- ---------------------------------------------------------------------------
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  storage_key text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------------
create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#7C9CBF',
  created_at timestamptz not null default now()
);

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

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
create index if not exists contacts_company_idx on public.contacts (company_id);
create index if not exists contacts_name_idx on public.contacts (full_name);
create index if not exists deals_stage_idx on public.deals (stage_id);
create index if not exists deals_status_idx on public.deals (status);
create index if not exists events_starts_idx on public.events (starts_at);
create index if not exists board_lists_board_idx on public.board_lists (board_id, position);
create index if not exists cards_list_idx on public.cards (list_id, position);
create index if not exists cards_due_idx on public.cards (due_date);
create index if not exists finance_entries_due_idx on public.finance_entries (due_date);
create index if not exists finance_entries_status_idx on public.finance_entries (status);
create index if not exists finance_entries_kind_idx on public.finance_entries (kind);
create index if not exists finance_entries_category_idx on public.finance_entries (category_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at before update on public.deals
  for each row execute function public.set_updated_at();

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

drop trigger if exists boards_set_updated_at on public.boards;
create trigger boards_set_updated_at before update on public.boards
  for each row execute function public.set_updated_at();

drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

drop trigger if exists finance_entries_set_updated_at on public.finance_entries;
create trigger finance_entries_set_updated_at before update on public.finance_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — app interno de uma empresa: todo usuário autenticado tem acesso.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'contacts', 'pipelines', 'pipeline_stages', 'deals',
    'events', 'boards', 'board_lists', 'cards', 'files',
    'finance_categories', 'finance_entries'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated_all" on public.%I', t);
    execute format(
      'create policy "authenticated_all" on public.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dados iniciais (só quando ainda não existe nada)
-- ---------------------------------------------------------------------------
insert into public.pipelines (name, is_default)
select 'Funil de vendas', true
where not exists (select 1 from public.pipelines);

insert into public.pipeline_stages (pipeline_id, name, color, position, probability)
select p.id, s.name, s.color, s.position, s.probability
from public.pipelines p
cross join (
  values
    ('Novo', '#7C9CBF', 0, 10),
    ('Contato feito', '#8FBF9F', 1, 30),
    ('Proposta', '#BFA27C', 2, 50),
    ('Negociação', '#A89BC9', 3, 70),
    ('Ganho', '#8FBF9F', 4, 100)
) as s (name, color, position, probability)
where p.is_default
  and not exists (select 1 from public.pipeline_stages ps where ps.pipeline_id = p.id);

insert into public.boards (name)
select 'Meu quadro'
where not exists (select 1 from public.boards);

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

insert into public.board_lists (board_id, name, position)
select b.id, l.name, l.position
from public.boards b
cross join (
  values ('A fazer', 0), ('Em andamento', 1), ('Concluído', 2)
) as l (name, position)
where not exists (select 1 from public.board_lists bl where bl.board_id = b.id);

-- ---------------------------------------------------------------------------
-- Storage: bucket privado "arquivos" + policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('arquivos', 'arquivos', false)
on conflict (id) do nothing;

drop policy if exists "arquivos_select" on storage.objects;
create policy "arquivos_select" on storage.objects
  for select to authenticated using (bucket_id = 'arquivos');

drop policy if exists "arquivos_insert" on storage.objects;
create policy "arquivos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'arquivos');

drop policy if exists "arquivos_update" on storage.objects;
create policy "arquivos_update" on storage.objects
  for update to authenticated using (bucket_id = 'arquivos') with check (bucket_id = 'arquivos');

drop policy if exists "arquivos_delete" on storage.objects;
create policy "arquivos_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'arquivos');
