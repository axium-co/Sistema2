import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/common/tenant-context';
import { ApiKeysService, hashApiKey } from '../src/modules/api-keys/api-keys.service';
import { ApiKeyGuard } from '../src/modules/api-keys/api-key.guard';

/**
 * API pública: emissão/revogação de chaves, autenticação por x-api-key,
 * escopo somente leitura e limite de requisições.
 */
describe('Chaves de API', () => {
  const prisma = new PrismaService();
  const service = new ApiKeysService(prisma);
  const guard = new ApiKeyGuard(service, prisma);

  let tenantId: string;
  let userId: string;

  const run = <T>(fn: () => Promise<T> | T) => TenantContext.run({ tenantId, userId }, fn);

  const context = (method: string, key?: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ method, headers: key ? { 'x-api-key': key } : {}, user: undefined }) }),
    }) as any;

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = Date.now();
    const tenant = await prisma.tenant.create({ data: { name: 'API', slug: `api-${suffix}` } });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: { tenantId, email: `api-${suffix}@test.dev`, passwordHash: 'x', name: 'Admin', role: 'OWNER' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await TenantContext.run({ allowUnscoped: true }, async () => {
      await prisma.apiKey.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });
    await prisma.$disconnect();
  });

  it('gera a chave uma única vez e guarda apenas o hash', async () => {
    const created = await run(() => service.create({ name: 'Integração', scopes: ['read'] }, userId));
    expect(created.secret).toMatch(/^axk_[0-9a-f]{8}_/);
    expect(created.preview).toContain('••••');
    expect((created as any).keyHash).toBeUndefined();

    const stored = await TenantContext.run({ allowUnscoped: true }, () =>
      prisma.apiKey.findFirst({ where: { id: created.id } }),
    );
    expect(stored?.keyHash).toBe(hashApiKey(created.secret));
    expect(JSON.stringify(stored)).not.toContain(created.secret);
  });

  it('autentica a chave e rejeita segredos inválidos', async () => {
    const created = await run(() => service.create({ name: 'Leitura', scopes: ['read'] }, userId));

    const key = await service.authenticate(created.secret);
    expect(key).toMatchObject({ id: created.id, tenantId });

    expect(await service.authenticate('axk_deadbeef_invalido')).toBeNull();
    expect(await service.authenticate('sem-prefixo')).toBeNull();

    await run(() => service.revoke(created.id));
    expect(await service.authenticate(created.secret)).toBeNull();
  });

  it('bloqueia escrita com chave somente leitura e exige o cabeçalho', async () => {
    const ro = await run(() => service.create({ name: 'RO', scopes: ['read'] }, userId));

    await expect(guard.canActivate(context('GET'))).rejects.toThrow('x-api-key ausente');
    await expect(guard.canActivate(context('GET', 'axk_xxx_yyy'))).rejects.toThrow('inválida');

    expect(await guard.canActivate(context('GET', ro.secret))).toBe(true);
    await expect(guard.canActivate(context('POST', ro.secret))).rejects.toThrow('apenas leitura');
  });

  it('aplica limite de requisições por minuto', async () => {
    const previous = process.env.API_RATE_LIMIT_PER_MIN;
    process.env.API_RATE_LIMIT_PER_MIN = '3';
    const key = await run(() => service.create({ name: 'Limitada', scopes: ['read'] }, userId));

    expect(await guard.canActivate(context('GET', key.secret))).toBe(true);
    expect(await guard.canActivate(context('GET', key.secret))).toBe(true);
    expect(await guard.canActivate(context('GET', key.secret))).toBe(true);
    await expect(guard.canActivate(context('GET', key.secret))).rejects.toThrow('Limite');

    if (previous === undefined) delete process.env.API_RATE_LIMIT_PER_MIN;
    else process.env.API_RATE_LIMIT_PER_MIN = previous;
  });
});
