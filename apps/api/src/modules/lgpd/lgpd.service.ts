import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const LGPD_SUBJECT_TYPES = ['Contact', 'Lead', 'User'] as const;
export type LgpdSubjectType = (typeof LGPD_SUBJECT_TYPES)[number];

export const CONSENT_PURPOSES = ['MARKETING', 'COMUNICACAO', 'TRATAMENTO'] as const;

const ANON_NAME = 'Titular anonimizado';
const ANON_BODY = '[conteúdo anonimizado — LGPD]';

interface AuditContext {
  actorId?: string;
  ip?: string;
}

/**
 * LGPD: atende aos direitos do titular (portabilidade, anonimização e exclusão)
 * e mantém o registro de consentimentos. Todas as operações são escopadas por
 * tenant e registradas no log de auditoria.
 */
@Injectable()
export class LgpdService {
  constructor(private readonly prisma: PrismaService) {}

  listConsents(subjectType?: string, subjectId?: string) {
    const where: Record<string, unknown> = {};
    if (subjectType) where.subjectType = subjectType;
    if (subjectId) where.subjectId = subjectId;
    return this.prisma.db.consentRecord.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async grantConsent(
    dto: { subjectType: string; subjectId: string; purpose: string; granted?: boolean; source?: string },
    ctx: AuditContext = {},
  ) {
    if (!LGPD_SUBJECT_TYPES.includes(dto.subjectType as LgpdSubjectType)) {
      throw new BadRequestException('Tipo de titular inválido');
    }
    const record = await this.prisma.db.consentRecord.create({
      data: {
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        purpose: dto.purpose,
        granted: dto.granted ?? true,
        source: dto.source ?? null,
        ip: ctx.ip ?? null,
      },
    });
    await this.audit(dto.subjectType, dto.subjectId, 'LGPD_CONSENT', ctx, { purpose: dto.purpose, granted: record.granted, consentId: record.id });
    return record;
  }

  async revokeConsent(id: string, ctx: AuditContext = {}) {
    const record = await this.prisma.findByIdOrFail('consentRecord', id);
    const updated = await this.prisma.db.consentRecord.update({ where: { id }, data: { granted: false } });
    await this.audit(record.subjectType, record.subjectId, 'LGPD_CONSENT_REVOKED', ctx, { purpose: record.purpose, consentId: id });
    return updated;
  }

  listRequests() {
    return this.prisma.db.dataRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /** Exportação (portabilidade) dos dados de um titular. */
  async exportSubject(subjectType: string, subjectId: string, ctx: AuditContext = {}) {
    const type = this.assertType(subjectType);
    const data = await this.collect(type, subjectId);
    const payload = {
      generatedAt: new Date().toISOString(),
      subject: { type, id: subjectId },
      consents: await this.listConsents(type, subjectId),
      data,
    };
    await this.record(type, subjectId, 'EXPORT', ctx, { entities: Object.keys(data) });
    return payload;
  }

  /** Anonimização irreversível dos dados pessoais (com exclusão opcional). */
  async anonymizeSubject(subjectType: string, subjectId: string, erase = false, ctx: AuditContext = {}) {
    const type = this.assertType(subjectType);
    const touched: string[] = [];

    if (type === 'Contact') {
      await this.prisma.findByIdOrFail('contact', subjectId);
      await this.prisma.db.contact.update({
        where: { id: subjectId },
        data: {
          fullName: ANON_NAME,
          email: null,
          phone: null,
          whatsapp: null,
          cpf: null,
          jobTitle: null,
          notes: null,
          source: null,
          ...(erase ? { deletedAt: new Date() } : {}),
        },
      });
      await this.prisma.db.activity.updateMany({
        where: { contactId: subjectId },
        data: { subject: ANON_NAME, body: null },
      });
      await this.prisma.db.note.updateMany({
        where: { entityType: 'Contact', entityId: subjectId },
        data: { body: ANON_BODY },
      });
      touched.push('Contact', 'Activity', 'Note');
    }

    if (type === 'Lead') {
      await this.prisma.findByIdOrFail('lead', subjectId);
      await this.prisma.db.lead.update({
        where: { id: subjectId },
        data: { notes: null, source: null, ...(erase ? { deletedAt: new Date() } : {}) },
      });
      touched.push('Lead');
    }

    if (type === 'User') {
      await this.prisma.findByIdOrFail('user', subjectId);
      await this.prisma.db.user.update({
        where: { id: subjectId },
        data: { name: ANON_NAME, phone: null, avatarUrl: null, ...(erase ? { deletedAt: new Date() } : {}) },
      });
      touched.push('User');
    }

    await this.prisma.db.consentRecord.updateMany({
      where: { subjectType: type, subjectId },
      data: { granted: false, source: 'LGPD-ERASURE' },
    });

    await this.record(type, subjectId, erase ? 'ERASURE' : 'ANONYMIZE', ctx, { entities: touched });
    return { ok: true, subject: { type, id: subjectId }, anonymized: touched, erased: erase };
  }

  /** Portabilidade dos dados da própria conta autenticada. */
  async myData(userId: string) {
    const user = await this.prisma.db.user.findFirst({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        timezone: true,
        locale: true,
        createdAt: true,
        team: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return { generatedAt: new Date().toISOString(), profile: user };
  }

  private assertType(subjectType: string): LgpdSubjectType {
    if (!LGPD_SUBJECT_TYPES.includes(subjectType as LgpdSubjectType)) {
      throw new BadRequestException('Tipo de titular inválido');
    }
    return subjectType as LgpdSubjectType;
  }

  private async collect(type: LgpdSubjectType, id: string) {
    if (type === 'Contact') {
      const contact = await this.prisma.db.contact.findFirst({
        where: { id },
        include: {
          company: true,
          leads: true,
          deals: { select: { id: true, title: true, amount: true, status: true, createdAt: true } },
          activities: true,
        },
      });
      if (!contact) throw new NotFoundException('Titular não encontrado');
      const notes = await this.prisma.db.note.findMany({ where: { entityType: 'Contact', entityId: id } });
      return { contact, notes };
    }

    if (type === 'Lead') {
      const lead = await this.prisma.db.lead.findFirst({ where: { id }, include: { contact: true } });
      if (!lead) throw new NotFoundException('Titular não encontrado');
      return { lead };
    }

    const user = await this.prisma.db.user.findFirst({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('Titular não encontrado');
    return { user };
  }

  private async record(
    subjectType: string,
    subjectId: string,
    requestType: string,
    ctx: AuditContext,
    result: Record<string, unknown>,
  ) {
    await this.prisma.db.dataRequest.create({
      data: {
        subjectType,
        subjectId,
        type: requestType,
        status: 'COMPLETED',
        requestedById: ctx.actorId ?? null,
        result: result as any,
      },
    });
    await this.audit(subjectType, subjectId, `LGPD_${requestType}`, ctx, result);
  }

  private async audit(entityType: string, entityId: string, action: string, ctx: AuditContext, meta: Record<string, unknown>) {
    await this.prisma.db.auditLog.create({
      data: {
        actorId: ctx.actorId ?? null,
        entityType,
        entityId,
        action,
        after: { ...meta, ip: ctx.ip ?? undefined } as any,
      },
    });
  }
}
