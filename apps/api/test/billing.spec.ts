import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/common/tenant-context';
import { BillingService } from '../src/modules/billing/billing.service';

/**
 * Billing (Asaas) em modo simulado: trial automático, checkout, webhook de
 * pagamento e cancelamento, refletindo no plano do tenant.
 */
describe('Billing (Asaas)', () => {
  const prisma = new PrismaService();
  const billing = new BillingService(prisma);

  let tenantId: string;
  let userId: string;

  const run = <T>(fn: () => Promise<T> | T) => TenantContext.run({ tenantId, userId }, fn);

  beforeAll(async () => {
    delete process.env.ASAAS_API_KEY;
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    await prisma.$connect();
    const suffix = Date.now();
    const tenant = await prisma.tenant.create({ data: { name: 'Billing', slug: `billing-${suffix}` } });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: { tenantId, email: `billing-${suffix}@test.dev`, passwordHash: 'x', name: 'Dono', role: 'OWNER' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await TenantContext.run({ allowUnscoped: true }, async () => {
      await prisma.invoice.deleteMany({ where: { tenantId } });
      await prisma.subscription.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  it('cria a assinatura em trial automaticamente', async () => {
    const sub = await run(() => billing.getSubscription());
    expect(sub).toMatchObject({ planCode: 'trial', status: 'TRIAL', priceCents: 0 });
    expect(sub.trialEndsAt).toBeTruthy();

    const again = await run(() => billing.getSubscription());
    expect(again.id).toBe(sub.id);
  });

  it('faz checkout de plano pago (modo simulado) e ativa a assinatura', async () => {
    const result = await run(() => billing.checkout({ planCode: 'pro', billingType: 'PIX' }));
    expect(result.mocked).toBe(true);
    expect(result.subscription).toMatchObject({ planCode: 'pro', status: 'ACTIVE', priceCents: 24700 });
    expect(result.invoice).toMatchObject({ status: 'PENDING', valueCents: 24700 });

    const tenant = await TenantContext.run({ allowUnscoped: true }, () =>
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    );
    expect(tenant?.planCode).toBe('pro');
  });

  it('rejeita plano inexistente ou gratuito', async () => {
    await expect(run(() => billing.checkout({ planCode: 'nao-existe' }))).rejects.toThrow('Plano inválido');
    await expect(run(() => billing.checkout({ planCode: 'trial' }))).rejects.toThrow('plano pago');
  });

  it('processa webhook de pagamento recebido', async () => {
    const sub = await run(() => billing.getSubscription());
    const event = {
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_123',
        subscription: sub.externalId,
        customer: sub.customerId,
        value: 247.0,
        dueDate: '2026-11-01',
        paymentDate: '2026-11-01',
        invoiceUrl: 'https://asaas.test/i/pay_123',
        nextDueDate: '2026-12-01',
      },
    };

    const result = await billing.handleWebhook(event);
    expect(result).toMatchObject({ received: true });

    const invoice = await TenantContext.run({ allowUnscoped: true }, () =>
      prisma.invoice.findUnique({ where: { externalId: 'pay_123' } }),
    );
    expect(invoice).toMatchObject({ status: 'PAID', valueCents: 24700, tenantId });

    const updated = await run(() => billing.getSubscription());
    expect(updated.status).toBe('ACTIVE');
    expect(updated.currentPeriodEnd).toBeTruthy();
  });

  it('valida o token do webhook quando configurado', async () => {
    process.env.ASAAS_WEBHOOK_TOKEN = 'segredo';
    await expect(billing.handleWebhook({ event: 'PAYMENT_RECEIVED', payment: {} }, 'errado')).rejects.toThrow('Token do webhook');
    delete process.env.ASAAS_WEBHOOK_TOKEN;
  });

  it('cancela a assinatura e volta o tenant para trial', async () => {
    const result = await run(() => billing.cancel());
    expect(result.subscription.status).toBe('CANCELED');
    expect(result.subscription.canceledAt).toBeTruthy();

    const tenant = await TenantContext.run({ allowUnscoped: true }, () =>
      prisma.tenant.findUnique({ where: { id: tenantId } }),
    );
    expect(tenant?.planCode).toBe('trial');
  });
});
