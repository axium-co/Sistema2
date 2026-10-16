import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { LEAD_STATUSES, type LeadStatus } from '@axium/shared';

export type ImportEntity = 'contacts' | 'companies' | 'leads';

const MAX_ROWS = 5000;

const ALIASES: Record<ImportEntity, Record<string, string>> = {
  contacts: {
    nome: 'fullName', 'nome completo': 'fullName', name: 'fullName', fullname: 'fullName',
    email: 'email', 'e-mail': 'email',
    telefone: 'phone', phone: 'phone', celular: 'phone',
    whatsapp: 'whatsapp',
    cpf: 'cpf',
    cargo: 'jobTitle', 'cargo/função': 'jobTitle', jobtitle: 'jobTitle',
    origem: 'source', source: 'source',
    empresa: 'companyName', company: 'companyName', 'nome da empresa': 'companyName',
    observacoes: 'notes', observações: 'notes', notes: 'notes',
  },
  companies: {
    nome: 'name', empresa: 'name', name: 'name', 'razao social': 'name', 'razão social': 'name',
    cnpj: 'cnpj',
    telefone: 'phone', phone: 'phone',
    site: 'website', website: 'website', 'site/website': 'website',
    endereco: 'address', endereço: 'address', address: 'address',
    cidade: 'city', city: 'city',
    estado: 'state', uf: 'state', state: 'state',
    observacoes: 'notes', observações: 'notes', notes: 'notes',
  },
  leads: {
    'email do contato': 'contactEmail', email: 'contactEmail', contactemail: 'contactEmail',
    'nome do contato': 'contactName', contato: 'contactName', contactname: 'contactName',
    origem: 'source', source: 'source',
    status: 'status',
    observacoes: 'notes', observações: 'notes', notes: 'notes',
  },
};

const REQUIRED: Record<ImportEntity, string[]> = {
  contacts: ['fullName'],
  companies: ['name'],
  leads: [],
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/^\ufeff/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function mapRow(entity: ImportEntity, raw: Record<string, unknown>) {
  const mapped: Record<string, string> = {};
  const aliases = ALIASES[entity];
  for (const [key, value] of Object.entries(raw)) {
    const normalized = normalizeHeader(key);
    const field = aliases[normalized] ?? normalized.replace(/\s+/g, '');
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) mapped[field] = text;
  }
  return mapped;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private parseCsv(buffer: Buffer): Record<string, unknown>[] {
    try {
      return parse(buffer, {
        columns: (header: string[]) => header.map((h) => h.trim()),
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      }) as Record<string, unknown>[];
    } catch (error: any) {
      throw new BadRequestException(`CSV inválido: ${error.message}`);
    }
  }

  private assertEntity(entity: string): asserts entity is ImportEntity {
    if (!['contacts', 'companies', 'leads'].includes(entity)) {
      throw new BadRequestException('Entidade de importação inválida. Use contacts, companies ou leads.');
    }
  }

  async run(entity: string, buffer: Buffer, userId: string, dryRun = false) {
    this.assertEntity(entity);
    if (!buffer?.length) throw new BadRequestException('Arquivo CSV vazio');

    const rows = this.parseCsv(buffer);
    if (rows.length === 0) throw new BadRequestException('Nenhuma linha encontrada no CSV');
    if (rows.length > MAX_ROWS) throw new BadRequestException(`Limite de ${MAX_ROWS} linhas por importação`);

    let created = 0;
    let skipped = 0;
    const errors: { line: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const line = i + 2; // +1 header, +1 índice base 0
      const data = mapRow(entity, rows[i]);
      try {
        for (const field of REQUIRED[entity]) {
          if (!data[field]) throw new Error(`Campo obrigatório ausente: ${field}`);
        }
        const outcome = await this.importRow(entity, data, userId, dryRun);
        if (outcome === 'created') created++;
        else skipped++;
      } catch (error: any) {
        errors.push({ line, message: error.message ?? 'Erro ao importar linha' });
      }
    }

    if (!dryRun && created > 0) {
      await this.audit.log({
        entityType: 'Import',
        action: 'IMPORT',
        actorId: userId,
        after: { entity, created, skipped, errors: errors.length },
      });
    }

    return { entity, dryRun, total: rows.length, created, skipped, errors: errors.slice(0, 100) };
  }

  private async importRow(
    entity: ImportEntity,
    data: Record<string, string>,
    userId: string,
    dryRun: boolean,
  ): Promise<'created' | 'skipped'> {
    if (entity === 'companies') {
      const existing = await this.prisma.db.company.findFirst({
        where: { name: { equals: data.name, mode: 'insensitive' }, deletedAt: null },
      });
      if (existing) return 'skipped';
      if (!dryRun) {
        await this.prisma.db.company.create({
          data: {
            name: data.name,
            cnpj: data.cnpj ?? null,
            phone: data.phone ?? null,
            website: data.website ?? null,
            address: data.address ?? null,
            city: data.city ?? null,
            state: data.state ?? null,
            notes: data.notes ?? null,
            ownerId: userId,
          },
        });
      }
      return 'created';
    }

    if (entity === 'contacts') {
      let companyId: string | null = null;
      if (data.companyName) {
        const company = await this.prisma.db.company.findFirst({
          where: { name: { equals: data.companyName, mode: 'insensitive' }, deletedAt: null },
        });
        companyId = company?.id ?? null;
        if (!company && !dryRun) {
          const createdCompany = await this.prisma.db.company.create({
            data: { name: data.companyName, ownerId: userId },
          });
          companyId = createdCompany.id;
        }
      }
      if (data.email) {
        const exists = await this.prisma.db.contact.findFirst({
          where: { email: data.email, deletedAt: null },
        });
        if (exists) return 'skipped';
      }
      if (!dryRun) {
        await this.prisma.db.contact.create({
          data: {
            fullName: data.fullName,
            email: data.email ?? null,
            phone: data.phone ?? null,
            whatsapp: data.whatsapp ?? null,
            cpf: data.cpf ?? null,
            jobTitle: data.jobTitle ?? null,
            source: data.source ?? null,
            notes: data.notes ?? null,
            companyId,
            ownerId: userId,
          },
        });
      }
      return 'created';
    }

    // leads
    let contactId: string | null = null;
    if (data.contactEmail) {
      const byEmail = await this.prisma.db.contact.findFirst({
        where: { email: data.contactEmail, deletedAt: null },
      });
      contactId = byEmail?.id ?? null;
    }
    if (!contactId && data.contactName) {
      const byName = await this.prisma.db.contact.findFirst({
        where: { fullName: { equals: data.contactName, mode: 'insensitive' }, deletedAt: null },
      });
      contactId = byName?.id ?? null;
    }
    if (!contactId) {
      throw new Error('Contato não encontrado (informe "email do contato" ou "nome do contato")');
    }
    const status = (LEAD_STATUSES as readonly string[]).includes((data.status ?? '').toUpperCase())
      ? (data.status.toUpperCase() as LeadStatus)
      : 'NOVO';
    if (!dryRun) {
      await this.prisma.db.lead.create({
        data: {
          contactId,
          ownerId: userId,
          source: data.source ?? null,
          status,
          notes: data.notes ?? null,
        },
      });
    }
    return 'created';
  }

  template(entity: string): { filename: string; content: string } {
    this.assertEntity(entity);
    const headers: Record<ImportEntity, string> = {
      contacts: 'nome,email,telefone,whatsapp,cpf,cargo,origem,empresa,observacoes',
      companies: 'nome,cnpj,telefone,site,endereco,cidade,estado,observacoes',
      leads: 'email do contato,nome do contato,origem,status,observacoes',
    };
    const samples: Record<ImportEntity, string> = {
      contacts: 'Maria Silva,maria@empresa.com.br,+55 11 99999-0000,+55 11 99999-0000,,Diretora,Indicação,Empresa Exemplo,Cliente indicado',
      companies: 'Empresa Exemplo,,+55 11 3333-4444,https://empresa.com.br,Av. Paulista 1000,São Paulo,SP,',
      leads: 'maria@empresa.com.br,,Site,NOVO,Lead importado',
    };
    return { filename: `modelo-${entity}.csv`, content: `\ufeff${headers[entity]}\n${samples[entity]}\n` };
  }
}
