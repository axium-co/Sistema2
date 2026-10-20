import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { planByCode, PLANS } from '@axium/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant-context';

const TRIAL_DAYS = 14;
const MONTHLY_CYCLE = 'MONTHLY';

interface CheckoutInput {
  planCode: string;
  billingType?: string;
  cpfCnpj?: string;
  name?: string;
  email?: string;
}

/**
 * Billing via Asaas (assinaturas recorrentes).
 *
 * Sem `ASAAS_API_KEY` configurada a cobrança funciona em modo simulado (mock),
 * útil para desenvolvimento e testes — marcado nas respostas como `mocked`.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');

  constructor(private readonly prisma: PrismaService) {}

  get mocked() {
    return !process.env.ASAAS_API_KEY;
  }

  plans() {
    return PLANS;
  }

  /** Garante uma assinatura para o tenant, iniciando em trial quando necessário. */
  async getSubscription() {
    const existing = await this.prisma.db.subscription.findFirst();
    if (existing) return existing;
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const created = await this.prisma.db.subscription.create({
      data: { planCode: 'trial', status: 'TRIAL', priceCents: 0, trialEndsAt },
    });
    await this.prisma.tenant.update({ where: { id: created.tenantId }, data: { planCode: 'trial' } });
    return created;
  }

  listInvoices() {
    return this.prisma.db.invoice.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async checkout(input: CheckoutInput) {
    const plan = PLANS.find((p) => p.code === input.planCode);
    if (!plan) throw new BadRequestException('Plano inválido');
    if (plan.priceCents === 0) throw new BadRequestException('Escolha um plano pago para assinar');

    const billingType = input.billingType ?? 'PIX';
    const subscription = await this.getSubscription();

    if (this.mocked) {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const updated = await this.prisma.db.subscription.update({
        where: { id: subscription.id },
        data: {
          planCode: plan.code,
          status: 'ACTIVE',
          priceCents: plan.priceCents,
          billingType,
          customerId: subscription.customerId ?? `cus_mock_${subscription.tenantId.slice(0, 8)}`,
          externalId: subscription.externalId ?? `sub_mock_${subscription.tenantId.slice(0, 8)}`,
          currentPeriodEnd: periodEnd,
          canceledAt: null,
        },
      });
      const invoice = await this.upsertInvoice({
        externalId: `pay_mock_${subscription.tenantId.slice(0, 8)}_${plan.code}`,
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        valueCents: plan.priceCents,
        status: 'PENDING',
        dueDate: now,
        invoiceUrl: null,
      });
      await this.applyPlan(subscription.tenantId, plan.code);
      return { mocked: true, subscription: updated, invoice };
    }

    const customerId =
      subscription.customerId ??
      (await this.asaas<{ id: string }>('POST', '/customers', {
        name: input.name ?? 'Empresa Axium',
        email: input.email,
        cpfCnpj: input.cpfCnpj,
        externalReference: subscription.tenantId,
      })).id;

    const nextDueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const remote = await this.asaas<{ id: string; nextDueDate: string }>('POST', '/subscriptions', {
      customer: customerId,
      billingType,
      value: plan.priceCents / 100,
      nextDueDate,
      cycle: MONTHLY_CYCLE,
      description: `Axium ${plan.name}`,
      externalReference: subscription.tenantId,
    });

    const updated = await this.prisma.db.subscription.update({
      where: { id: subscription.id },
      data: {
        planCode: plan.code,
        status: 'ACTIVE',
        priceCents: plan.priceCents,
        billingType,
        customerId,
        externalId: remote.id,
        currentPeriodEnd: new Date(remote.nextDueDate),
        canceledAt: null,
      },
    });
    await this.applyPlan(subscription.tenantId, plan.code);
    return { mocked: false, subscription: updated };
  }

  async cancel() {
    const subscription = await this.getSubscription();
    if (subscription.externalId && !this.mocked) {
      await this.asaas('DELETE', `/subscriptions/${subscription.externalId}`).catch((err) => {
        this.logger.warn(`Falha ao cancelar assinatura no Asaas: ${err}`);
      });
    }
    const updated = await this.prisma.db.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });
    await this.applyPlan(subscription.tenantId, 'trial');
    return { mocked: this.mocked, subscription: updated };
  }

  /** Processa eventos do Asaas (pagamentos e assinaturas). */
  async handleWebhook(body: any, token?: string) {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (expected && token !== expected) {
      throw new UnauthorizedException('Token do webhook inválido');
    }

    const event: string = body?.event ?? '';
    const payment = body?.payment ?? {};
    if (!event) throw new BadRequestException('Evento ausente');

    return TenantContext.run({ allowUnscoped: true }, async () => {
      const subscription = payment.subscription
        ? await this.prisma.subscription.findFirst({ where: { externalId: payment.subscription } })
        : await this.prisma.subscription.findFirst({ where: { customerId: payment.customer } });
      if (!subscription) {
        this.logger.warn(`Webhook ${event} sem assinatura correspondente`);
        return { received: true, ignored: true };
      }

      const paid = event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED';
      const overdue = event === 'PAYMENT_OVERDUE';
      const canceled = event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_INACTIVATED';

      if (payment.id) {
        await this.upsertInvoice({
          externalId: payment.id,
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          valueCents: Math.round(Number(payment.value ?? 0) * 100),
          status: paid ? 'PAID' : overdue ? 'OVERDUE' : 'PENDING',
          dueDate: payment.dueDate ? new Date(payment.dueDate) : null,
          paidAt: paid ? new Date(payment.paymentDate ?? Date.now()) : null,
          invoiceUrl: payment.invoiceUrl ?? null,
        });
      }

      const data: Record<string, unknown> = {};
      if (paid) {
        data.status = 'ACTIVE';
        data.currentPeriodEnd = payment.nextDueDate ? new Date(payment.nextDueDate) : undefined;
      }
      if (overdue) data.status = 'PAST_DUE';
      if (canceled) {
        data.status = 'CANCELED';
        data.canceledAt = new Date();
        await this.applyPlan(subscription.tenantId, 'trial');
      }
      if (Object.keys(data).length > 0 && !canceled) {
        await this.prisma.subscription.update({ where: { id: subscription.id }, data: data as any });
      }

      return { received: true, event };
    });
  }

  private upsertInvoice(data: {
    externalId: string;
    tenantId: string;
    subscriptionId: string;
    valueCents: number;
    status: string;
    dueDate: Date | null;
    paidAt?: Date | null;
    invoiceUrl: string | null;
  }) {
    const { externalId, ...rest } = data;
    return this.prisma.db.invoice.upsert({
      where: { externalId },
      create: { externalId, ...rest },
      update: rest,
    });
  }

  private applyPlan(tenantId: string, planCode: string) {
    return this.prisma.tenant.update({ where: { id: tenantId }, data: { planCode } });
  }

  private async asaas<T = any>(method: string, path: string, payload?: unknown): Promise<T> {
    const base = process.env.ASAAS_BASE_URL ?? 'https://api.asaas.com/v3';
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        access_token: process.env.ASAAS_API_KEY ?? '',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`Asaas ${method} ${path} falhou (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  }
}
