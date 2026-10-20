import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/common/tenant-context';
import { LgpdService } from '../src/modules/lgpd/lgpd.service';

/**
 * LGPD: portabilidade, anonimização/exclusão e registro de consentimento com
 * trilha de auditoria, sempre escopado por tenant.
 */
describe('LGPD', () => {
  const prisma = new PrismaService();
  const lgpd = new LgpdService(prisma);

  let tenantId: string;
  let userId: string;
  let contactId: string;
  let leadId: string;
  let otherTenantId: string;
  let otherContactId: string;

  const run = <T>(fn: () => Promise<T> | T) => TenantContext.run({ tenantId, userId }, fn);

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = Date.now();
    const tenant = await prisma.tenant.create({ data: { name: 'LGPD', slug: `lgpd-${suffix}` } });
    tenantId = tenant.id;
    const other = await prisma.tenant.create({ data: { name: 'Outra', slug: `lgpd-outra-${suffix}` } });
    otherTenantId = other.id;
    const user = await prisma.user.create({
      data: { tenantId, email: `lgpd-${suffix}@test.dev`, passwordHash: 'x', name: 'Titular' },
    });
    userId = user.id;

    const contact = await run(async () =>
      prisma.db.contact.create({
        data: { fullName: 'João da Silva', email: 'joao@test.dev', phone: '+5511999999999', cpf: '12345678900' },
      }),
    );
    contactId = contact.id;
    const lead = await run(async () => prisma.db.lead.create({ data: { contactId, source: 'site', notes: 'LGPD' } }));
    leadId = lead.id;
    await run(async () =>
      prisma.db.activity.create({
        data: { type: 'CALL', subject: 'Ligar para João', body: 'assunto sensível', contactId, createdById: userId },
      }),
    );
    await run(async () => prisma.db.note.create({ data: { entityType: 'Contact', entityId: contactId, body: 'nota pessoal', authorId: userId } }));
    otherContactId = await run(async () => {
      const c = await prisma.contact.create({ data: { tenantId: otherTenantId, fullName: 'De outro tenant' } });
      return c.id;
    });
  });

  afterAll(async () => {
    await TenantContext.run({ allowUnscoped: true }, async () => {
      await prisma.consentRecord.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
      await prisma.dataRequest.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
      await prisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
      await prisma.note.deleteMany({ where: { tenantId } });
      await prisma.activity.deleteMany({ where: { tenantId } });
      await prisma.lead.deleteMany({ where: { tenantId } });
      await prisma.contact.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    });
    await prisma.$disconnect();
  });

  it('registra e revoga consentimentos', async () => {
    const consent = await run(() =>
      lgpd.grantConsent({ subjectType: 'Contact', subjectId: contactId, purpose: 'MARKETING' }, { actorId: userId, ip: '10.0.0.1' }),
    );
    expect(consent.granted).toBe(true);

    const list = await run(async () => lgpd.listConsents('Contact', contactId));
    expect(list).toHaveLength(1);

    const revoked = await run(() => lgpd.revokeConsent(consent.id, { actorId: userId }));
    expect(revoked.granted).toBe(false);

    const audit = await run(async () => prisma.db.auditLog.findMany({ where: { entityId: contactId } }));
    expect(audit.map((a: any) => a.action)).toContain('LGPD_CONSENT_REVOKED');

    await expect(
      run(() => lgpd.grantConsent({ subjectType: 'Empresa', subjectId: contactId, purpose: 'MARKETING' })),
    ).rejects.toThrow('Tipo de titular');
  });

  it('exporta os dados do titular (portabilidade)', async () => {
    const payload = await run(() => lgpd.exportSubject('Contact', contactId, { actorId: userId }));
    expect(payload.subject).toEqual({ type: 'Contact', id: contactId });
    expect(payload.data.contact).toMatchObject({ fullName: 'João da Silva', email: 'joao@test.dev' });
    expect(payload.data.contact.activities).toHaveLength(1);
    expect(payload.data.notes).toHaveLength(1);
    expect(payload.consents.length).toBeGreaterThanOrEqual(1);

    const requests = await run(async () => lgpd.listRequests());
    expect(requests[0]).toMatchObject({ type: 'EXPORT', status: 'COMPLETED' });
  });

  it('anonimiza os dados pessoais e mantém a trilha de auditoria', async () => {
    const result = await run(() => lgpd.anonymizeSubject('Contact', contactId, false, { actorId: userId }));
    expect(result.anonymized).toContain('Contact');

    const contact = await run(async () => prisma.db.contact.findFirst({ where: { id: contactId } }));
    expect(contact).toMatchObject({ fullName: 'Titular anonimizado', email: null, phone: null, cpf: null });

    const activity = await run(async () => prisma.db.activity.findFirst({ where: { contactId } }));
    expect(activity?.body).toBeNull();

    const audit = await run(async () => prisma.db.auditLog.findMany({ where: { entityId: contactId, action: 'LGPD_ANONYMIZE' } }));
    expect(audit).toHaveLength(1);
  });

  it('exclui (soft delete) e não vaza dados entre tenants', async () => {
    await expect(
      run(() => lgpd.anonymizeSubject('Contact', otherContactId, true, { actorId: userId })),
    ).rejects.toThrow('não encontrado');

    await run(() => lgpd.anonymizeSubject('Lead', leadId, true, { actorId: userId }));
    const lead = await run(async () => prisma.db.lead.findFirst({ where: { id: leadId } }));
    expect(lead?.deletedAt).toBeTruthy();
    expect(lead?.notes).toBeNull();
  });

  it('exporta os dados da própria conta', async () => {
    const mine = await run(() => lgpd.myData(userId));
    expect(mine.profile).toMatchObject({ id: userId, email: expect.stringContaining('lgpd-') });
    expect(mine.profile.passwordHash).toBeUndefined();
  });
});
