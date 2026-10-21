-- Enforcement de Row Level Security no banco.
--
-- Cria o papel de aplicação `axium_app` (sem bypass de RLS) e aplica
-- FORCE ROW LEVEL SECURITY nas tabelas de tenant. Depois de rodar este script:
--   1. Aponte DATABASE_URL da API para o papel `axium_app`.
--   2. Defina RLS_ENABLED=true na API.
--   3. A API define `app.tenant_id` por requisição (RlsInterceptor / set_config).
--
-- Uso via npm (SQL puro, sem senha — docker-compose local):
--   npm run db:rls:enforce -w @axium/api
--
-- Uso em produção (defina a senha depois de criar o papel):
--   psql "$DATABASE_URL" -f prisma/rls-enforce.sql
--   psql "$DATABASE_URL" -c "ALTER ROLE axium_app PASSWORD '<SENHA_FORTE>';"
--
-- Requer um papel com privilégios de superusuário (o usuário padrão `axium` do docker-compose é).
--
-- O papel é criado SEM senha (LOGIN sem PASSWORD). Em produção, defina a senha
-- com ALTER ROLE logo em seguida e use-a na DATABASE_URL da API.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axium_app') THEN
    CREATE ROLE axium_app LOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO axium_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO axium_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO axium_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO axium_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO axium_app;

DO $$
DECLARE
  t text;
  -- Todas as tabelas com tenant_id do schema (35). Precisa cobrir as mesmas
  -- tabelas das migrations de RLS: FORCE sem policy nega todo acesso.
  tables text[] := ARRAY[
    'users', 'teams', 'audit_logs', 'companies', 'contacts', 'leads',
    'pipelines', 'deals', 'products', 'activities', 'notes', 'tags',
    'goals', 'calendars', 'events', 'routines', 'routine_runs', 'habits',
    'time_blocks', 'focus_sessions',
    'boards', 'cards', 'folders', 'files', 'notifications', 'custom_fields',
    'labels', 'invitations',
    'api_keys', 'automation_rules', 'calendar_integrations',
    'consent_records', 'data_requests', 'invoices', 'subscriptions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'tenant_isolation') THEN
        RAISE WARNING 'Tabela % sem policy tenant_isolation: rode as migrations de RLS antes do enforce.', t;
        CONTINUE;
      END IF;
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
