import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { paginate } from '../../common/pagination';
import type { CompanyDto, ContactDto, LeadDto, TagDto } from './crm.dto';

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

  private findByIdOrFail(model: string, id: string, opts?: any) {
    return this.prisma.findByIdOrFail(model, id, opts);
  }

  async assertContactExists(id: string) {
    const contact = await this.prisma.findByIdOrFail('contact', id);
    if (!contact) throw new NotFoundException('Contato não encontrado');
    return contact;
  }
}
