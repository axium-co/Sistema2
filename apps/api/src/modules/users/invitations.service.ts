import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword } from '../../common/password';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant-context';
import { AuditService } from '../../common/audit.service';
import { MailerService } from '../../common/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from '../auth/auth.service';
import type { Role } from '@axium/shared';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
    private readonly auth: AuthService,
  ) {}

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private webUrl() {
    return (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  async create(data: { email: string; name?: string; role: Role }, actorId: string) {
    const email = data.email.toLowerCase().trim();
    const tenantId = TenantContext.requireTenant();

    const existingUser = await this.prisma.db.user.findFirst({ where: { email, deletedAt: null } });
    if (existingUser) throw new BadRequestException('Já existe um usuário com este e-mail nesta empresa');

    await this.prisma.db.invitation.updateMany({
      where: { email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invitation = await this.prisma.db.invitation.create({
      data: {
        email,
        name: data.name?.trim() || null,
        role: data.role,
        tokenHash: this.hash(token),
        invitedById: actorId,
        expiresAt,
      },
    });

    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId } });
    const inviteUrl = `${this.webUrl()}/convite?token=${token}`;
    const result = await this.mailer.sendInvitation({
      to: email,
      name: data.name,
      tenantName: tenant?.name ?? 'sua empresa',
      role: data.role,
      inviteUrl,
      expiresAt,
    });

    await this.audit.log({ entityType: 'Invitation', entityId: invitation.id, action: 'CREATE', actorId, after: { email, role: data.role } });
    await this.notifications.notify({
      userId: actorId,
      type: 'SYSTEM',
      title: 'Convite enviado',
      body: `${email} foi convidado(a) como ${data.role}.`,
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      delivered: result.delivered,
      mocked: result.mocked,
      inviteUrl: result.mocked ? inviteUrl : undefined,
    };
  }

  list() {
    return this.prisma.db.invitation.findMany({
      where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      include: { invitedBy: { select: { id: true, name: true } } },
    });
  }

  async revoke(id: string, actorId: string) {
    const invitation = await this.prisma.db.invitation.findFirst({ where: { id } });
    if (!invitation) throw new NotFoundException('Convite não encontrado');
    await this.prisma.db.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.log({ entityType: 'Invitation', entityId: id, action: 'REVOKE', actorId });
    return { ok: true };
  }

  /** Público: pré-visualiza um convite a partir do token. */
  async preview(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { tenant: { select: { name: true } } },
    });
    if (!invitation) throw new NotFoundException('Convite inválido');
    const expired = invitation.expiresAt.getTime() < Date.now();
    const used = Boolean(invitation.acceptedAt) || Boolean(invitation.revokedAt);
    return {
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      tenantName: invitation.tenant.name,
      valid: !expired && !used,
      expired,
      used,
    };
  }

  /** Público: aceita o convite, cria o usuário e devolve uma sessão. */
  async accept(
    params: { token: string; name?: string; password: string },
    device?: string,
    ip?: string,
  ) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: this.hash(params.token) },
    });
    if (!invitation) throw new NotFoundException('Convite inválido');
    if (invitation.acceptedAt) throw new BadRequestException('Este convite já foi utilizado');
    if (invitation.revokedAt) throw new BadRequestException('Este convite foi revogado');
    if (invitation.expiresAt.getTime() < Date.now()) throw new BadRequestException('Este convite expirou');

    const passwordHash = await hashPassword(params.password);

    const user = await TenantContext.run({ tenantId: invitation.tenantId }, async () => {
      const existing = await this.prisma.db.user.findFirst({
        where: { email: invitation.email, deletedAt: null },
      });
      if (existing) throw new BadRequestException('Já existe um usuário com este e-mail');

      const created = await this.prisma.db.user.create({
        data: {
          email: invitation.email,
          name: (params.name ?? invitation.name ?? invitation.email.split('@')[0]).trim(),
          role: invitation.role,
          passwordHash,
        },
      });

      await this.prisma.db.calendar.create({
        data: { userId: created.id, name: 'Minha agenda', isDefault: true },
      });

      await this.prisma.db.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      await this.audit.log({
        entityType: 'User',
        entityId: created.id,
        action: 'ACCEPT_INVITE',
        actorId: created.id,
        after: { email: created.email, role: created.role },
      });

      return created;
    });

    if (invitation.invitedById) {
      await this.notifications.notify({
        userId: invitation.invitedById,
        type: 'SYSTEM',
        title: 'Convite aceito',
        body: `${user.name} aceitou o convite e entrou na equipe.`,
      });
    }

    return this.auth.issueSession(user.id, device, ip);
  }
}
