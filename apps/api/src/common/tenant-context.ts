import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';
import type { Role } from '@axium/shared';

export interface TenantStore {
  tenantId?: string;
  userId?: string;
  role?: Role;
  allowUnscoped?: boolean;
  /** Cliente de transação com RLS ativo (definido quando RLS_ENABLED=true). */
  tx?: unknown;
}

class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  get(): TenantStore | undefined {
    return this.als.getStore();
  }

  get tenantId(): string | undefined {
    return this.als.getStore()?.tenantId;
  }

  get userId(): string | undefined {
    return this.als.getStore()?.userId;
  }

  get role(): Role | undefined {
    return this.als.getStore()?.role;
  }

  enterWith(store: TenantStore) {
    this.als.enterWith(store);
  }

  run<T>(store: TenantStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  requireTenant(): string {
    const tenantId = this.als.getStore()?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Contexto de empresa ausente');
    }
    return tenantId;
  }
}

export const TenantContext = new TenantContextService();
