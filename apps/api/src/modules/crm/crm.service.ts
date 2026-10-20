import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { paginate } from '../../common/pagination';
import type {
  CompanyDto,
  ContactDto,
  CustomFieldDto,
  CustomFieldValueDto,
  GoalDto,
  LeadDto,
  ProductDto,
  TagDto,
  UpdateCustomFieldDto,
  UpdateGoalDto,
  UpdateProductDto,
} from './crm.dto';

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Companies ----------
  async listCompanies(query: { search?: string; page?: number; pageSize?: number }) {
    const { skip, take, page, pageSize } = paginate(query);
    const where = {
      deletedAt: null,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.company.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { owner: { select: { id: true, name: true } }, _count: { select: { contacts: true, deals: true } } },
      }),
      this.prisma.db.company.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getCompany(id: string) {
    const company = await this.prisma.findByIdOrFail('company', id, {
      include: {
        owner: { select: { id: true, name: true } },
        contacts: { where: { deletedAt: null } },
        deals: { where: { deletedAt: null }, include: { stage: true } },
      },
    });
    return company;
  }

  createCompany(dto: CompanyDto) {
    return this.prisma.db.company.create({ data: dto as any });
  }

  async updateCompany(id: string, dto: Partial<CompanyDto>) {
    await this.prisma.findByIdOrFail('company', id);
    const updated = await this.prisma.db.company.update({ where: { id }, data: dto as any });
    await this.audit.log({ entityType: 'Company', entityId: id, action: 'UPDATE', after: dto });
    return updated;
  }

  async removeCompany(id: string) {
    await this.prisma.findByIdOrFail('company', id);
    await this.prisma.db.company.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ entityType: 'Company', entityId: id, action: 'DELETE' });
    return { ok: true };
  }

  // ---------- Contacts ----------
  async listContacts(query: { search?: string; companyId?: string; page?: number; pageSize?: number }) {
    const { skip, take, page, pageSize } = paginate(query);
    const where = {
      deletedAt: null,
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.contact.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { company: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } } },
      }),
      this.prisma.db.contact.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getContact(id: string) {
    return this.prisma.findByIdOrFail('contact', id, {
      include: {
        company: true,
        owner: { select: { id: true, name: true } },
        deals: { where: { deletedAt: null }, include: { stage: true } },
        activities: { orderBy: { occurredAt: 'desc' }, take: 50 },
      },
    });
  }

  createContact(dto: ContactDto) {
    return this.prisma.db.contact.create({ data: dto as any });
  }

  async updateContact(id: string, dto: Partial<ContactDto>) {
    await this.prisma.findByIdOrFail('contact', id);
    const updated = await this.prisma.db.contact.update({ where: { id }, data: dto as any });
    await this.audit.log({ entityType: 'Contact', entityId: id, action: 'UPDATE', after: dto });
    return updated;
  }

  async removeContact(id: string) {
    await this.prisma.findByIdOrFail('contact', id);
    await this.prisma.db.contact.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ entityType: 'Contact', entityId: id, action: 'DELETE' });
    return { ok: true };
  }

  // ---------- Leads ----------
  async listLeads(query: { status?: string; ownerId?: string; page?: number; pageSize?: number }) {
    const { skip, take, page, pageSize } = paginate(query);
    const where = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.lead.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { contact: true, owner: { select: { id: true, name: true } } },
      }),
      this.prisma.db.lead.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async createLead(dto: LeadDto) {
    const contact = await this.findByIdOrFail('contact', dto.contactId);
    return this.prisma.db.lead.create({
      data: { ...dto, status: dto.status ?? 'NOVO' } as any,
    }).then((lead: any) => {
      this.audit.log({ entityType: 'Lead', entityId: lead.id, action: 'CREATE', after: { contactId: contact.id } });
      return lead;
    });
  }

  async updateLead(id: string, dto: Partial<LeadDto>) {
    await this.prisma.findByIdOrFail('lead', id);
    return this.prisma.db.lead.update({ where: { id }, data: dto as any });
  }

  async convertLead(id: string, pipelineStage: { pipelineId: string; stageId: string; ownerId: string }) {
    const lead = await this.prisma.findByIdOrFail('lead', id, { include: { contact: true } });
    const deal = await this.prisma.db.deal.create({
      data: {
        title: `${lead.contact.fullName} — oportunidade`,
        pipelineId: pipelineStage.pipelineId,
        stageId: pipelineStage.stageId,
        primaryContactId: lead.contactId,
        companyId: lead.contact.companyId,
        ownerId: pipelineStage.ownerId,
      },
    });
    await this.prisma.db.lead.update({ where: { id }, data: { status: 'CONVERTIDO', dealId: deal.id } });
    await this.audit.log({ entityType: 'Lead', entityId: id, action: 'CONVERT', after: { dealId: deal.id } });
    return deal;
  }

  async removeLead(id: string) {
    await this.prisma.findByIdOrFail('lead', id);
    await this.prisma.db.lead.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  // ---------- Tags ----------
  async listTags() {
    return this.prisma.db.tag.findMany({ orderBy: { name: 'asc' } });
  }

  async createTag(dto: TagDto) {
    return this.prisma.db.tag.create({ data: dto as any });
  }

  async removeTag(id: string) {
    await this.prisma.findByIdOrFail('tag', id);
    await this.prisma.db.tag.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- Products ----------
  async listProducts(query: { includeInactive?: string; search?: string }) {
    return this.prisma.db.product.findMany({
      where: {
        ...(query.includeInactive === 'true' ? {} : { active: true }),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  createProduct(dto: ProductDto) {
    return this.prisma.db.product.create({
      data: { name: dto.name, price: dto.price ?? 0, sku: dto.sku ?? null, active: dto.active ?? true },
    });
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.prisma.findByIdOrFail('product', id);
    const updated = await this.prisma.db.product.update({ where: { id }, data: dto as any });
    await this.audit.log({ entityType: 'Product', entityId: id, action: 'UPDATE', after: dto });
    return updated;
  }

  async removeProduct(id: string) {
    await this.prisma.findByIdOrFail('product', id);
    await this.prisma.db.product.update({ where: { id }, data: { active: false } });
    await this.audit.log({ entityType: 'Product', entityId: id, action: 'DELETE' });
    return { ok: true };
  }

  // ---------- Goals (metas) ----------
  async listGoals(query: { ownerId?: string }) {
    return this.prisma.db.goal.findMany({
      where: { ...(query.ownerId ? { ownerId: query.ownerId } : {}) },
      orderBy: { periodStart: 'desc' },
      include: { owner: { select: { id: true, name: true } } },
    });
  }

  createGoal(dto: GoalDto, userId: string) {
    return this.prisma.db.goal.create({
      data: {
        ownerId: dto.ownerId ?? userId,
        metric: dto.metric,
        target: dto.target,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
      },
    });
  }

  async updateGoal(id: string, dto: UpdateGoalDto) {
    await this.prisma.findByIdOrFail('goal', id);
    const data: any = { ...dto };
    if (dto.periodStart) data.periodStart = new Date(dto.periodStart);
    if (dto.periodEnd) data.periodEnd = new Date(dto.periodEnd);
    const updated = await this.prisma.db.goal.update({ where: { id }, data });
    await this.audit.log({ entityType: 'Goal', entityId: id, action: 'UPDATE', after: dto });
    return updated;
  }

  async removeGoal(id: string) {
    await this.prisma.findByIdOrFail('goal', id);
    await this.prisma.db.goal.delete({ where: { id } });
    await this.audit.log({ entityType: 'Goal', entityId: id, action: 'DELETE' });
    return { ok: true };
  }

  // ---------- Custom fields ----------
  listCustomFields(entityType?: string) {
    return this.prisma.db.customField.findMany({
      where: { ...(entityType ? { entityType } : {}) },
      orderBy: [{ entityType: 'asc' }, { position: 'asc' }],
    });
  }

  createCustomField(dto: CustomFieldDto) {
    return this.prisma.db.customField.create({
      data: {
        entityType: dto.entityType,
        label: dto.label,
        type: dto.type,
        options: (dto.options ?? {}) as any,
        position: dto.position ?? 0,
      },
    });
  }

  async updateCustomField(id: string, dto: UpdateCustomFieldDto) {
    await this.prisma.findByIdOrFail('customField', id);
    return this.prisma.db.customField.update({ where: { id }, data: dto as any });
  }

  async removeCustomField(id: string) {
    await this.prisma.findByIdOrFail('customField', id);
    await this.prisma.db.customField.delete({ where: { id } });
    return { ok: true };
  }

  async getCustomFieldValues(entityType: string, entityId: string) {
    const fields = await this.prisma.db.customField.findMany({
      where: { entityType },
      orderBy: { position: 'asc' },
    });
    const values = await this.prisma.db.customFieldValue.findMany({
      where: { entityId, customFieldId: { in: fields.map((f: any) => f.id) } },
    });
    const byField = new Map(values.map((v: any) => [v.customFieldId, v.value]));
    return fields.map((f: any) => ({ field: f, value: byField.get(f.id) ?? null }));
  }

  async setCustomFieldValue(dto: CustomFieldValueDto) {
    const field = await this.prisma.findByIdOrFail('customField', dto.customFieldId);
    if (!field) throw new NotFoundException('Campo personalizado não encontrado');
    await this.prisma.db.customFieldValue.upsert({
      where: { customFieldId_entityId: { customFieldId: dto.customFieldId, entityId: dto.entityId } },
      create: { customFieldId: dto.customFieldId, entityId: dto.entityId, value: dto.value as any },
      update: { value: dto.value as any },
    });
    return { ok: true };
  }

  private findByIdOrFail(model: string, id: string, opts?: any) {
    return this.prisma.findByIdOrFail(model, id, opts);
  }

  async assertContactExists(id: string) {
    const contact = await this.prisma.findByIdOrFail('contact', id);
    if (!contact) throw new NotFoundException('Contato não encontrado');
    return contact;
  }
}
