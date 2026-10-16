import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hashPassword } from '../../common/password';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { Role } from '@axium/shared';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list() {
    return this.prisma.db.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        avatarUrl: true,
        teamId: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async invite(data: { name: string; email: string; role: Role; password: string; teamId?: string }, actorId: string) {
    const email = data.email.toLowerCase().trim();
    const existing = await this.prisma.db.user.findFirst({ where: { email } });
    if (existing) {
      throw new BadRequestException('Já existe um usuário com este e-mail nesta empresa');
    }
    const passwordHash = await hashPassword(data.password);
    const user = await this.prisma.db.user.create({
      data: {
        email,
        name: data.name.trim(),
        role: data.role,
        passwordHash,
        teamId: data.teamId ?? null,
      },
    });
    await this.audit.log({ entityType: 'User', entityId: user.id, action: 'INVITE', actorId, after: { email, role: data.role } });
    await this.notifications.notify({
      userId: actorId,
      type: 'SYSTEM',
      title: 'Usuário adicionado',
      body: `${user.name} entrou na equipe como ${data.role}.`,
    });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async updateRole(id: string, role: Role, actorId: string) {
    const user = await this.prisma.db.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.role === 'OWNER') throw new ForbiddenException('O proprietário não pode ter o perfil alterado');
    await this.prisma.db.user.update({ where: { id }, data: { role } });
    await this.audit.log({ entityType: 'User', entityId: id, action: 'UPDATE_ROLE', actorId, after: { role } });
    return { ok: true };
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) throw new BadRequestException('Você não pode remover a si mesmo');
    const user = await this.prisma.db.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.role === 'OWNER') throw new ForbiddenException('O proprietário não pode ser removido');
    await this.prisma.db.user.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ entityType: 'User', entityId: id, action: 'REMOVE', actorId });
    return { ok: true };
  }

  async teams() {
    return this.prisma.db.team.findMany({ orderBy: { name: 'asc' } });
  }

  async createTeam(name: string, leadId?: string) {
    return this.prisma.db.team.create({ data: { name, leadId: leadId ?? null } });
  }
}
