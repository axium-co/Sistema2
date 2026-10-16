-- Enforcement de Row Level Security no banco.
--
-- Cria o papel de aplicação `axium_app` (sem bypass de RLS) e aplica
-- FORCE ROW LEVEL SECURITY nas tabelas de tenant. Depois de rodar este script:
--   1. Aponte DATABASE_URL da API para o papel `axium_app`.
--   2. Garanta que cada requisição defina `app.tenant_id` na conexão
--      (SET app.tenant_id = '<uuid>') antes das consultas.
--
-- Uso: psql "$DATABASE_URL" -f prisma/rls-enforce.sql
-- Requer um papel com privilégios de superusuário (o usuário padrão `axium` do docker-compose é).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axium_app') THEN
    CREATE ROLE axium_app LOGIN PASSWORD 'change-me-app-password';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO axium_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO axium_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO axium_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO axium_app;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'users', 'teams', 'audit_logs', 'companies', 'contacts', 'leads',
    'pipelines', 'deals', 'products', 'activities', 'notes', 'tags',
    'goals', 'calendars', 'events', 'routines', 'routine_runs', 'habits',
    'time_blocks', 'focus_sessions',
    'boards', 'cards', 'folders', 'files', 'notifications', 'custom_fields',
    'labels', 'invitations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
