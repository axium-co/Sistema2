import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant-context';

export const API_KEY_SCOPES = ['read', 'write'] as const;
const KEY_ISSUER = 'axk';

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Chaves de acesso à API pública. O segredo só é retornado na criação; o banco
 * guarda apenas o hash SHA-256 e o prefixo para exibição.
 */
@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const keys = await this.prisma.db.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
    return keys.map((k: any) => this.mask(k));
  }

  async create(dto: { name: string; scopes?: string[]; expiresAt?: string }, userId?: string) {
    const scopes = this.normalizeScopes(dto.scopes);
    const prefix = randomBytes(4).toString('hex');
    const secret = randomBytes(24).toString('base64url');
    const raw = `${KEY_ISSUER}_${prefix}_${secret}`;
    const key = await this.prisma.db.apiKey.create({
      data: {
        name: dto.name,
        prefix,
        keyHash: hashApiKey(raw),
        scopes,
        createdById: userId ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    return { ...this.mask(key), secret: raw };
  }

  async revoke(id: string) {
    await this.prisma.findByIdOrFail('apiKey', id);
    const key = await this.prisma.db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return this.mask(key);
  }

  /** Resolve a chave a partir do segredo apresentado no cabeçalho. */
  async authenticate(raw: string) {
    if (!raw || !raw.startsWith(`${KEY_ISSUER}_`)) return null;
    const key = await TenantContext.run({ allowUnscoped: true }, async () =>
      this.prisma.db.apiKey.findUnique({ where: { keyHash: hashApiKey(raw) } }),
    );
    if (!key || key.revokedAt) return null;
    if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedException('Chave de API expirada');
    }
    await TenantContext.run({ allowUnscoped: true }, async () =>
      this.prisma.db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }),
    );
    return key;
  }

  private normalizeScopes(scopes?: string[]) {
    const list = (scopes ?? ['read']).filter((s) => (API_KEY_SCOPES as readonly string[]).includes(s));
    if (list.length === 0) throw new BadRequestException('Informe ao menos um escopo válido (read, write)');
    return [...new Set(list)];
  }

  private mask(key: any) {
    const { keyHash, ...rest } = key;
    void keyHash;
    return { ...rest, preview: `${KEY_ISSUER}_${key.prefix}_••••` };
  }
}
