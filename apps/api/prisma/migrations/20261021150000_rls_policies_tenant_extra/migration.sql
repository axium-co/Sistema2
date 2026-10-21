-- Row Level Security para as tabelas com tenant_id que surgiram depois da
-- migration 20261015194051_rls_policies: api_keys, automation_rules,
-- calendar_integrations, consent_records, data_requests, invoices, subscriptions.
--
-- Sem estas políticas, um FORCE ROW LEVEL SECURITY (prisma/rls-enforce.sql)
--在这些 tabelas negaria todo acesso — RLS habilitado sem policy bloqueia tudo.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'api_keys', 'automation_rules', 'calendar_integrations',
    'consent_records', 'data_requests', 'invoices', 'subscriptions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
        t
      );
    END IF;
  END LOOP;
END $$;
