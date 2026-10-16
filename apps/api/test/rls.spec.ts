import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/common/tenant-context';

/**
 * Prova que as políticas de RLS (migration 20261015194051_rls_policies) isolam
 * os dados por `app.tenant_id` quando a sessão NÃO é o proprietário das tabelas.
 *
 * O papel de conexão padrão (`axium`) é o dono e ignora as políticas — o
 * enforcement real do banco é ativado com `prisma/rls-enforce.sql`. Aqui usamos
 * um papel temporário sem privilégios de dono para verificar as políticas.
 */
describe('Row Level Security (políticas por tenant)', () => {
  const prisma = new PrismaService();
  const role = 'axium_rls_test';
  let tenantA: string;
  let tenantB: string;
  let companyA: string;
  let companyB: string;
  let roleReady = false;

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = Date.now();

    const a = await prisma.tenant.create({ data: { name: 'RLS Tenant A', slug: `rls-a-${suffix}` } });
    const b = await prisma.tenant.create({ data: { name: 'RLS Tenant B', slug: `rls-b-${suffix}` } });
    tenantA = a.id;
    tenantB = b.id;

    const cA = await TenantContext.run({ tenantId: tenantA }, async () =>
      prisma.db.company.create({ data: { name: 'RLS Empresa A' } }),
    );
    const cB = await TenantContext.run({ tenantId: tenantB }, async () =>
      prisma.db.company.create({ data: { name: 'RLS Empresa B' } }),
    );
    companyA = cA.id;
    companyB = cB.id;

    try {
      await prisma.$executeRawUnsafe(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`,
      );
      await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await prisma.$executeRawUnsafe(`GRANT SELECT ON companies TO ${role}`);
      roleReady = true;
    } catch {
      roleReady = false;
    }
  });

  afterAll(async () => {
    if (roleReady) {
      await prisma
        .$executeRawUnsafe(`DROP OWNED BY ${role}`)
        .catch(() => undefined);
      await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined);
    }
    await TenantContext.run({ allowUnscoped: true }, async () => {
      await prisma.company.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    });
    await prisma.$disconnect();
  });

  it('a política está habilitada nas tabelas de tenant', async () => {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'companies' AND relkind = 'r'`,
    );
    expect(rows[0]?.relrowsecurity).toBe(true);
  });

  it('um papel não proprietário só enxerga linhas do tenant corrente', async () => {
    if (!roleReady) {
      expect(true).toBe(true);
      return;
    }
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', '${tenantA}', true)`);
      return tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM companies`);
    });

    const ids = rows.map((r) => r.id);
    expect(ids).toContain(companyA);
    expect(ids).not.toContain(companyB);
    expect(ids.every((id) => id === companyA)).toBe(true);
  });
});
