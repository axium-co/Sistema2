import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantContext } from '../../common/tenant-context';
import type {
  BoardDto,
  CardDto,
  ChecklistDto,
  ChecklistItemDto,
  CommentDto,
  LabelDto,
  ListDto,
  MoveCardDto,
  UpdateCardDto,
  UpdateChecklistItemDto,
} from './boards.dto';

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  listBoards() {
    return this.prisma.db.board.findMany({
      where: { archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { lists: true, cards: true } } },
    });
  }

  async getBoard(id: string) {
    const board = await this.prisma.findByIdOrFail('board', id, {
      include: {
        labels: true,
        lists: {
          where: { archivedAt: null },
          orderBy: { position: 'asc' },
          include: {
            cards: {
              where: { archivedAt: null },
              orderBy: { position: 'asc' },
              include: {
                assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
                labels: { include: { label: true } },
                checklists: { include: { items: true } },
                _count: { select: { comments: true } },
              },
            },
          },
        },
      },
    });
    return board;
  }

  createBoard(dto: BoardDto, userId: string) {
    return this.prisma.db.board.create({
      data: {
        name: dto.name,
        icon: dto.icon ?? null,
        visibility: (dto.visibility as any) ?? 'TENANT',
        teamId: dto.teamId ?? null,
        createdById: userId,
        lists: {
          create: [
            { name: 'A fazer', position: 1000 },
            { name: 'Em andamento', position: 2000 },
            { name: 'Concluído', position: 3000 },
          ],
        },
      },
    });
  }

  async updateBoard(id: string, dto: Partial<BoardDto>) {
    await this.prisma.findByIdOrFail('board', id);
    return this.prisma.db.board.update({ where: { id }, data: dto as any });
  }

  async archiveBoard(id: string) {
    await this.prisma.findByIdOrFail('board', id);
    await this.prisma.db.board.update({ where: { id }, data: { archivedAt: new Date() } });
    return { ok: true };
  }

  async createList(boardId: string, dto: ListDto) {
    await this.prisma.findByIdOrFail('board', boardId);
    const last = await this.prisma.db.list.findFirst({ where: { boardId }, orderBy: { position: 'desc' } });
    return this.prisma.db.list.create({
      data: { boardId, name: dto.name, wipLimit: dto.wipLimit ?? null, position: last ? last.position + 1000 : 1000 },
    });
  }

  async updateList(id: string, dto: Partial<ListDto>) {
    const list = await this.prisma.db.list.findUnique({ where: { id } });
    if (!list) throw new BadRequestException('Lista não encontrada');
    return this.prisma.db.list.update({ where: { id }, data: dto as any });
  }

  async archiveList(id: string) {
    const list = await this.prisma.db.list.findUnique({ where: { id } });
    if (!list) throw new BadRequestException('Lista não encontrada');
    await this.prisma.db.list.update({ where: { id }, data: { archivedAt: new Date() } });
    return { ok: true };
  }

  async createLabel(boardId: string, dto: LabelDto) {
    await this.prisma.findByIdOrFail('board', boardId);
    return this.prisma.db.label.create({ data: { boardId, name: dto.name, color: dto.color ?? '#71717A' } });
  }

  async listCards(query: { boardId?: string; assigneeId?: string; dueBefore?: string; priority?: string }) {
    const where: any = { archivedAt: null };
    if (query.boardId) where.boardId = query.boardId;
    if (query.priority) where.priority = query.priority;
    if (query.assigneeId) where.assignees = { some: { userId: query.assigneeId } };
    if (query.dueBefore) where.dueDate = { lte: new Date(query.dueBefore) };
    return this.prisma.db.card.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { position: 'asc' }],
      include: {
        list: { select: { id: true, name: true } },
        board: { select: { id: true, name: true } },
        assignees: { include: { user: { select: { id: true, name: true } } } },
        labels: { include: { label: true } },
        checklists: { include: { items: true } },
      },
    });
  }

  async getCard(id: string) {
    return this.prisma.findByIdOrFail('card', id, {
      include: {
        list: true,
        board: { include: { labels: true } },
        assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        labels: { include: { label: true } },
        checklists: { include: { items: { orderBy: { position: 'asc' } } } },
        comments: {
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
    });
  }

  async createCard(listId: string, dto: CardDto) {
    const list = await this.prisma.db.list.findUnique({ where: { id: listId }, include: { board: true } });
    if (!list) throw new BadRequestException('Lista não encontrada');
    const last = await this.prisma.db.card.findFirst({
      where: { listId, archivedAt: null },
      orderBy: { position: 'desc' },
    });
    const card = await this.prisma.db.card.create({
      data: {
        boardId: list.boardId,
        listId,
        createdById: TenantContext.userId!,
        title: dto.title,
        description: dto.description ?? '',
        priority: (dto.priority as any) ?? 'MEDIUM',
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        estimateMin: dto.estimateMin ?? null,
        dealId: dto.dealId ?? null,
        position: last ? last.position + 1000 : 1000,
        assignees: dto.assigneeIds?.length
          ? { create: dto.assigneeIds.map((id) => ({ userId: id })) }
          : undefined,
      },
    });
    if (dto.assigneeIds?.length) {
      for (const assigneeId of dto.assigneeIds) {
        await this.notifications.notify({
          userId: assigneeId,
          type: 'ASSIGNMENT',
          title: 'Nova tarefa atribuída',
          body: card.title,
          entityType: 'Card',
          entityId: card.id,
          url: `/tarefas/${list.boardId}?card=${card.id}`,
        });
      }
    }
    return card;
  }

  async updateCard(id: string, dto: UpdateCardDto) {
    const card = await this.prisma.findByIdOrFail('card', id);
    if (!card) throw new BadRequestException('Cartão não encontrado');
    const data: any = {};
    for (const key of ['title', 'description', 'priority', 'estimateMin', 'spentMin', 'dealId'] as const) {
      if ((dto as any)[key] !== undefined) data[key] = (dto as any)[key];
    }
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.completed !== undefined) data.completedAt = dto.completed ? new Date() : null;
    const updated = await this.prisma.db.card.update({ where: { id }, data });
    await this.audit.log({ entityType: 'Card', entityId: id, action: 'UPDATE' });
    return updated;
  }

  async moveCard(id: string, dto: MoveCardDto) {
    const card = await this.prisma.findByIdOrFail('card', id);
    if (!card) throw new BadRequestException('Cartão não encontrado');
    const list = await this.prisma.db.list.findUnique({ where: { id: dto.listId } });
    if (!list || list.boardId !== card.boardId) {
      throw new BadRequestException('Lista de destino inválida');
    }

    if (list.wipLimit) {
      const count = await this.prisma.db.card.count({
        where: { listId: dto.listId, archivedAt: null, completedAt: null },
      });
      if (count >= list.wipLimit && card.listId !== dto.listId) {
        throw new BadRequestException(`Limite WIP da lista "${list.name}" atingido (${list.wipLimit})`);
      }
    }

    const updated = await this.prisma.db.card.update({
      where: { id },
      data: { listId: dto.listId, position: dto.position ?? Date.now() },
    });
    await this.audit.log({ entityType: 'Card', entityId: id, action: 'MOVE', before: { listId: card.listId }, after: { listId: dto.listId } });
    return updated;
  }

  async archiveCard(id: string) {
    await this.prisma.findByIdOrFail('card', id);
    await this.prisma.db.card.update({ where: { id }, data: { archivedAt: new Date() } });
    return { ok: true };
  }

  async assign(cardId: string, userId: string) {
    await this.prisma.findByIdOrFail('card', cardId);
    await this.prisma.db.cardAssignee.upsert({
      where: { cardId_userId: { cardId, userId } },
      create: { cardId, userId },
      update: {},
    });
    await this.notifications.notify({
      userId,
      type: 'ASSIGNMENT',
      title: 'Você foi atribuído a uma tarefa',
      entityType: 'Card',
      entityId: cardId,
      url: `/tarefas?card=${cardId}`,
    });
    return { ok: true };
  }

  async unassign(cardId: string, userId: string) {
    await this.prisma.db.cardAssignee.deleteMany({ where: { cardId, userId } });
    return { ok: true };
  }

  async addLabel(cardId: string, labelId: string) {
    await this.prisma.findByIdOrFail('card', cardId);
    await this.prisma.db.cardLabel.upsert({
      where: { cardId_labelId: { cardId, labelId } },
      create: { cardId, labelId },
      update: {},
    });
    return { ok: true };
  }

  async removeLabel(cardId: string, labelId: string) {
    await this.prisma.db.cardLabel.deleteMany({ where: { cardId, labelId } });
    return { ok: true };
  }

  async createChecklist(cardId: string, dto: ChecklistDto) {
    await this.prisma.findByIdOrFail('card', cardId);
    return this.prisma.db.checklist.create({ data: { cardId, title: dto.title }, include: { items: true } });
  }

  async createChecklistItem(checklistId: string, dto: ChecklistItemDto) {
    const checklist = await this.prisma.db.checklist.findUnique({ where: { id: checklistId } });
    if (!checklist) throw new BadRequestException('Checklist não encontrado');
    const last = await this.prisma.db.checklistItem.findFirst({ where: { checklistId }, orderBy: { position: 'desc' } });
    return this.prisma.db.checklistItem.create({
      data: { checklistId, title: dto.title, position: last ? last.position + 1000 : 1000 },
    });
  }

  async updateChecklistItem(id: string, dto: UpdateChecklistItemDto) {
    return this.prisma.db.checklistItem.update({ where: { id }, data: dto as any });
  }

  async deleteChecklistItem(id: string) {
    await this.prisma.db.checklistItem.delete({ where: { id } });
    return { ok: true };
  }

  async addComment(cardId: string, dto: CommentDto, authorId: string) {
    const card = await this.prisma.findByIdOrFail('card', cardId);
    const comment = await this.prisma.db.cardComment.create({
      data: { cardId, authorId, body: dto.body, mentions: (dto.mentions as any) ?? [] },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    for (const userId of dto.mentions ?? []) {
      await this.notifications.notify({
        userId,
        type: 'MENTION',
        title: 'Você foi mencionado',
        body: `${comment.author.name}: ${dto.body.slice(0, 120)}`,
        entityType: 'Card',
        entityId: card?.id,
        url: `/tarefas?card=${cardId}`,
      });
    }
    return comment;
  }
}
