import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/common/tenant-context';

/**
 * Critério de aceite do briefing: "Usuário do tenant A nunca consegue ver dados do tenant B".
 */
describe('Isolamento entre tenants', () => {
  const prisma = new PrismaService();
  let tenantA: string;
  let tenantB: string;
  let companyA: string;
  let companyB: string;

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = Date.now();

    const a = await prisma.tenant.create({ data: { name: 'Tenant A', slug: `tenant-a-${suffix}` } });
    const b = await prisma.tenant.create({ data: { name: 'Tenant B', slug: `tenant-b-${suffix}` } });
    tenantA = a.id;
    tenantB = b.id;

    const cA = await TenantContext.run({ tenantId: tenantA }, async () =>
      prisma.db.company.create({ data: { name: 'Empresa do Tenant A' } }),
    );
    const cB = await TenantContext.run({ tenantId: tenantB }, async () =>
      prisma.db.company.create({ data: { name: 'Empresa do Tenant B' } }),
    );
    companyA = cA.id;
    companyB = cB.id;
  });

  afterAll(async () => {
    await TenantContext.run({ allowUnscoped: true }, async () => {
      await prisma.company.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    });
    await prisma.$disconnect();
  });

  it('injeta automaticamente o tenant_id ao criar registros', async () => {
    await TenantContext.run({ allowUnscoped: true }, async () => {
      const a = await prisma.company.findUnique({ where: { id: companyA } });
      const b = await prisma.company.findUnique({ where: { id: companyB } });
      expect(a?.tenantId).toBe(tenantA);
      expect(b?.tenantId).toBe(tenantB);
    });
  });

  it('lista apenas registros do tenant corrente', async () => {
    const listA = await TenantContext.run({ tenantId: tenantA }, async () => prisma.db.company.findMany());
    expect(listA.every((c: any) => c.tenantId === tenantA)).toBe(true);
    expect(listA.some((c: any) => c.id === companyB)).toBe(false);
  });

  it('não vaza dados ao filtrar explicitamente pelo id de outro tenant', async () => {
    const leaked = await TenantContext.run({ tenantId: tenantA }, async () =>
      prisma.db.company.findMany({ where: { id: companyB } }),
    );
    expect(leaked).toHaveLength(0);
  });

  it('impede acessar uma empresa de outro tenant por id', async () => {
    await expect(
      TenantContext.run({ tenantId: tenantA }, async () => prisma.findByIdOrFail('company', companyB)),
    ).rejects.toThrow();
  });

  it('bloqueia operações em modelos de negócio sem contexto de tenant', async () => {
    await expect(prisma.db.company.findMany()).rejects.toThrow();
  });
});
