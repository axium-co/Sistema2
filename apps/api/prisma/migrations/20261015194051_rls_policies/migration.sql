-- Row Level Security (defesa em profundidade) para as tabelas com tenant_id.
--
-- Estratégia: as políticas comparam tenant_id com o GUC `app.tenant_id`
-- (definido por requisição). O RLS é habilitado, mas NÃO forçado, então o
-- proprietário (papel de conexão padrão) continua ignorando as políticas — a
-- aplicação segue enforcement na camada de serviço (PrismaService).
--
-- Para enforcement efetivo no banco, rode `prisma/rls-enforce.sql`, que cria o
-- papel de aplicação `axium_app` e aplica FORCE ROW LEVEL SECURITY. Veja o README.

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'users', 'teams', 'audit_logs', 'companies', 'contacts', 'leads',
    'pipelines', 'deals', 'products', 'activities', 'notes', 'tags',
    'goals', 'calendars', 'events', 'routines', 'routine_runs', 'habits',
    'boards', 'cards', 'folders', 'files', 'notifications', 'custom_fields',
    'labels', 'invitations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
      t
    );
  END LOOP;
END $$;
