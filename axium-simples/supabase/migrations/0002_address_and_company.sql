-- AXIUM Interno — endereço e dados da empresa dentro do contato.
-- Execute no SQL Editor do Supabase se você já rodou o 0001_init.sql antes.

alter table public.companies add column if not exists address text;

alter table public.contacts add column if not exists address text;
alter table public.contacts add column if not exists company_name text;
alter table public.contacts add column if not exists company_cnpj text;
alter table public.contacts add column if not exists company_website text;

-- Aproveita empresas já vinculadas aos contatos existentes.
update public.contacts as contact
set
  company_name = coalesce(contact.company_name, company.name),
  company_cnpj = coalesce(contact.company_cnpj, company.cnpj),
  company_website = coalesce(contact.company_website, company.website)
from public.companies as company
where contact.company_id = company.id
  and (
    contact.company_name is null
    or contact.company_cnpj is null
    or contact.company_website is null
  );

-- Atualiza o cache do PostgREST para as novas colunas aparecerem na API.
notify pgrst, 'reload schema';
