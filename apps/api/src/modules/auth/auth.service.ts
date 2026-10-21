import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { hashPassword, verifyPassword, passwordHasher } from '../../common/password';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant-context';
import { AuditService } from '../../common/audit.service';
import { signAccessToken, JWT_SECRET, JWT_REFRESH_SECRET, type AuthUser } from '../../common/auth';
import { TwoFactorService } from './two-factor.service';
import type { Role } from '@axium/shared';

const DEFAULT_STAGES = [
  { name: 'Novo lead', color: '#71717A', probability: 10 },
  { name: 'Contato feito', color: '#7C9CBF', probability: 25 },
  { name: 'Proposta enviada', color: '#A89BC9', probability: 50 },
  { name: 'Negociação', color: '#BFA27C', probability: 75 },
  { name: 'Fechado', color: '#8FBF9F', probability: 100 },
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private slugify(name: string) {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40);
  }

  private signRefreshToken(sessionId: string) {
    const days = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);
    return jwt.sign({ sid: sessionId, type: 'refresh' }, JWT_REFRESH_SECRET(), { expiresIn: `${days}d` } as jwt.SignOptions);
  }

  private async createSession(user: AuthUser, device?: string, ip?: string) {
    const sessionId = randomUUID();
    const refreshToken = this.signRefreshToken(sessionId);
    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.userId,
        tokenHash: this.hashToken(refreshToken),
        device: device ?? null,
        ip: ip ?? null,
      },
    });
    return { accessToken: signAccessToken(user), refreshToken };
  }

  async register(dto: { companyName: string; name: string; email: string; password: string }, device?: string, ip?: string) {
    const email = dto.email.toLowerCase().trim();
    const existing = await TenantContext.run({ allowUnscoped: true }, () =>
      this.prisma.user.findFirst({ where: { email } }),
    );
    if (existing) {
      throw new BadRequestException('Este e-mail já está cadastrado');
    }

    const baseSlug = this.slugify(dto.companyName) || 'empresa';
    let slug = baseSlug;
    let n = 1;
    while (await this.prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${n++}`;
    }

    const tenant = await this.prisma.tenant.create({
      data: { name: dto.companyName.trim(), slug },
    });

    const passwordHash = await hashPassword(dto.password);

    return TenantContext.run({ tenantId: tenant.id }, async () => {
      const user = await this.prisma.db.user.create({
        data: {
          tenantId: tenant.id,
          email,
          passwordHash,
          name: dto.name.trim(),
          role: 'OWNER',
        },
      });

      const pipeline = await this.prisma.db.pipeline.create({
        data: { tenantId: tenant.id, name: 'Funil de vendas', isDefault: true },
      });
      await this.prisma.db.pipelineStage.createMany({
        data: DEFAULT_STAGES.map((s, i) => ({ ...s, pipelineId: pipeline.id, position: i })),
      });

      await this.prisma.db.calendar.create({
        data: { tenantId: tenant.id, userId: user.id, name: 'Minha agenda', isDefault: true },
      });

      await this.prisma.db.board.create({
        data: {
          tenantId: tenant.id,
          createdById: user.id,
          name: 'Minhas tarefas',
          visibility: 'TENANT',
          lists: {
            create: [
              { name: 'A fazer', position: 1000 },
              { name: 'Em andamento', position: 2000 },
              { name: 'Concluído', position: 3000 },
            ],
          },
        },
      });

      await this.audit.log({ entityType: 'Tenant', entityId: tenant.id, action: 'CREATE', actorId: user.id });

      const authUser: AuthUser = {
        userId: user.id,
        tenantId: tenant.id,
        role: user.role as Role,
        email: user.email,
        name: user.name,
      };
      const tokens = await this.createSession(authUser, device, ip);
      return { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, user: this.publicUser(user), ...tokens };
    });
  }

  async login(dto: { email: string; password: string; tenantSlug?: string }, device?: string, ip?: string) {
    const email = dto.email.toLowerCase().trim();

    const candidates = await TenantContext.run({ allowUnscoped: true }, () =>
      this.prisma.user.findMany({
        where: { email, deletedAt: null, ...(dto.tenantSlug ? { tenant: { slug: dto.tenantSlug } } : {}) },
        include: { tenant: true },
      }),
    );

    if (candidates.length === 0) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    if (candidates.length > 1) {
      throw new BadRequestException(
        'Este e-mail existe em mais de uma empresa. Informe o identificador da empresa (tenantSlug).',
      );
    }

    const user = candidates[0];
    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    if (user.passwordHash.startsWith('$2') && (await passwordHasher()) === 'argon2') {
      try {
        const rehashed = await hashPassword(dto.password);
        await TenantContext.run({ tenantId: user.tenantId }, () =>
          this.prisma.db.user.update({ where: { id: user.id }, data: { passwordHash: rehashed } }),
        );
        user.passwordHash = rehashed;
      } catch {
        /* rehash é opcional: nunca bloqueia o login */
      }
    }

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      return {
        twoFactorRequired: true,
        challengeToken: this.signTwoFactorChallenge(user.id, user.tenantId),
        email: user.email,
      };
    }

    const authUser: AuthUser = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as Role,
      email: user.email,
      name: user.name,
    };
    const tokens = await this.createSession(authUser, device, ip);
    return { tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug }, user: this.publicUser(user), ...tokens };
  }

  private signTwoFactorChallenge(userId: string, tenantId: string) {
    return jwt.sign({ type: '2fa', userId, tenantId }, JWT_SECRET(), { expiresIn: '5m' } as jwt.SignOptions);
  }

  async verifyTwoFactor(challengeToken: string, code: string, device?: string, ip?: string) {
    let payload: { type: string; userId: string };
    try {
      payload = jwt.verify(challengeToken, JWT_SECRET()) as { type: string; userId: string };
    } catch {
      throw new UnauthorizedException('Desafio de verificação expirado. Faça login novamente.');
    }
    if (payload.type !== '2fa') {
      throw new UnauthorizedException('Desafio de verificação inválido');
    }

    const user = await TenantContext.run({ allowUnscoped: true }, () =>
      this.prisma.user.findFirst({ where: { id: payload.userId, deletedAt: null }, include: { tenant: true } }),
    );
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    if (!(await this.twoFactor.check(user.twoFactorSecret, code))) {
      throw new UnauthorizedException('Código de verificação inválido');
    }

    const authUser: AuthUser = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as Role,
      email: user.email,
      name: user.name,
    };
    const tokens = await this.createSession(authUser, device, ip);
    return { tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug }, user: this.publicUser(user), ...tokens };
  }

  /** Emite uma sessão para um usuário já cadastrado (usado no aceite de convite). */
  async issueSession(userId: string, device?: string, ip?: string) {
    const user = await TenantContext.run({ allowUnscoped: true }, () =>
      this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, include: { tenant: true } }),
    );
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    const authUser: AuthUser = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as Role,
      email: user.email,
      name: user.name,
    };
    const tokens = await this.createSession(authUser, device, ip);
    return {
      tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug },
      user: this.publicUser(user),
      ...tokens,
    };
  }

  async refresh(refreshToken: string, device?: string, ip?: string) {
    let payload: { sid: string; type: string };
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET()) as { sid: string; type: string };
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const session = await this.prisma.session.findUnique({ where: { id: payload.sid } });
    if (!session || session.revokedAt || this.hashToken(refreshToken) !== session.tokenHash) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const user = await TenantContext.run({ allowUnscoped: true }, () =>
      this.prisma.user.findFirst({ where: { id: session.userId, deletedAt: null }, include: { tenant: true } }),
    );
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });

    const authUser: AuthUser = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as Role,
      email: user.email,
      name: user.name,
    };
    const tokens = await this.createSession(authUser, device, ip);
    return { tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug }, user: this.publicUser(user), ...tokens };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET()) as { sid: string };
        await this.prisma.session.updateMany({
          where: { id: payload.sid, userId },
          data: { revokedAt: new Date() },
        });
      } catch {
        /* token inválido: nada a revogar */
      }
    }
    return { ok: true };
  }

  async me(userId: string) {
    const user = await TenantContext.run({ allowUnscoped: true }, () =>
      this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: { tenant: true, team: true },
      }),
    );
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    return {
      ...this.publicUser(user),
      tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, planCode: user.tenant.planCode },
      team: user.team ? { id: user.team.id, name: user.team.name } : null,
    };
  }

  async updateProfile(userId: string, data: Record<string, unknown>) {
    const { notificationPrefs, ...rest } = data as any;
    const user = await this.prisma.db.user.update({
      where: { id: userId },
      data: {
        ...rest,
        ...(notificationPrefs !== undefined ? { notificationPrefs } : {}),
      },
    });
    return this.publicUser(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await TenantContext.run({ allowUnscoped: true }, () =>
      this.prisma.user.findFirst({ where: { id: userId } }),
    );
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Senha atual incorreta');
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.db.user.update({ where: { id: userId }, data: { passwordHash } });
    return { ok: true };
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, device: true, ip: true, createdAt: true, lastSeenAt: true },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, userId }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  private publicUser(user: any) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
      locale: user.locale,
      twoFactorEnabled: user.twoFactorEnabled,
      notificationPrefs: user.notificationPrefs,
    };
  }
}
