import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Role } from '@axium/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant-context';
import { ApiKeysService } from './api-keys.service';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const WINDOW_MS = 60_000;

/**
 * Autentica requisições da API pública via cabeçalho `x-api-key`, aplica o
 * escopo (read/write) e um limite de requisições por chave em janela fixa.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const raw = request.headers?.['x-api-key'];
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new UnauthorizedException('Cabeçalho x-api-key ausente');
    }

    const key = await this.apiKeys.authenticate(raw);
    if (!key) throw new UnauthorizedException('Chave de API inválida ou revogada');

    const scopes: string[] = key.scopes ?? [];
    if (!READ_METHODS.has(request.method) && !scopes.includes('write')) {
      throw new ForbiddenException('Esta chave de API permite apenas leitura');
    }

    this.enforceRateLimit(key.id);

    const owner = await this.resolveOwner(key.tenantId, key.createdById);
    const user = {
      userId: owner.id,
      tenantId: key.tenantId,
      role: owner.role as Role,
      email: owner.email,
      name: owner.name,
    };
    TenantContext.enterWith({ tenantId: key.tenantId, userId: owner.id, role: owner.role as Role });
    request.user = user;
    request.apiKey = { id: key.id, name: key.name, scopes };
    return true;
  }

  private enforceRateLimit(keyId: string) {
    const limit = Number(process.env.API_RATE_LIMIT_PER_MIN ?? 120);
    const now = Date.now();
    const entry = this.hits.get(keyId);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(keyId, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }
    entry.count += 1;
    if (entry.count > limit) {
      throw new ForbiddenException(`Limite de ${limit} requisições por minuto excedido`);
    }
  }

  private async resolveOwner(tenantId: string, createdById?: string | null) {
    return TenantContext.run({ allowUnscoped: true }, async () => {
      if (createdById) {
        const byId = await this.prisma.user.findFirst({ where: { id: createdById, tenantId, deletedAt: null } });
        if (byId) return byId;
      }
      const owner = await this.prisma.user.findFirst({
        where: { tenantId, deletedAt: null, role: 'OWNER' },
        orderBy: { createdAt: 'asc' },
      });
      if (!owner) throw new UnauthorizedException('Empresa sem usuário responsável');
      return owner;
    });
  }
}
