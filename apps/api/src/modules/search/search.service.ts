import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string) {
    if (!q || q.trim().length < 2) return { results: [] };
    const term = q.trim();

    const [contacts, companies, deals, cards, events, files] = await Promise.all([
      this.prisma.db.contact.findMany({
        where: { deletedAt: null, fullName: { contains: term, mode: 'insensitive' } },
        take: 5,
        select: { id: true, fullName: true, email: true },
      }),
      this.prisma.db.company.findMany({
        where: { deletedAt: null, name: { contains: term, mode: 'insensitive' } },
        take: 5,
        select: { id: true, name: true },
      }),
      this.prisma.db.deal.findMany({
        where: { deletedAt: null, title: { contains: term, mode: 'insensitive' } },
        take: 5,
        select: { id: true, title: true, amount: true },
      }),
      this.prisma.db.card.findMany({
        where: { archivedAt: null, title: { contains: term, mode: 'insensitive' } },
        take: 5,
        select: { id: true, title: true, boardId: true },
      }),
      this.prisma.db.event.findMany({
        where: { deletedAt: null, title: { contains: term, mode: 'insensitive' } },
        take: 5,
        select: { id: true, title: true, startsAt: true },
      }),
      this.prisma.db.file.findMany({
        where: { deletedAt: null, name: { contains: term, mode: 'insensitive' } },
        take: 5,
        select: { id: true, name: true, mimeType: true },
      }),
    ]);

    const results = [
      ...contacts.map((c: any) => ({ type: 'contact', id: c.id, title: c.fullName, subtitle: c.email, url: `/crm/contatos/${c.id}` })),
      ...companies.map((c: any) => ({ type: 'company', id: c.id, title: c.name, url: `/crm/empresas/${c.id}` })),
      ...deals.map((d: any) => ({ type: 'deal', id: d.id, title: d.title, subtitle: 'Negócio', url: `/crm/negocios/${d.id}` })),
      ...cards.map((c: any) => ({ type: 'card', id: c.id, title: c.title, subtitle: 'Tarefa', url: `/tarefas/${c.boardId}?card=${c.id}` })),
      ...events.map((e: any) => ({ type: 'event', id: e.id, title: e.title, subtitle: 'Evento', url: `/agenda` })),
      ...files.map((f: any) => ({ type: 'file', id: f.id, title: f.name, subtitle: f.mimeType, url: `/arquivos` })),
    ];

    return { results };
  }
}
