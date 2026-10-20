import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, lastValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from './tenant-context';

/**
 * Quando RLS_ENABLED=true, executa cada requisição autenticada dentro de uma
 * transação com `app.tenant_id` definido, para que as políticas de Row Level
 * Security do PostgreSQL filtrem os dados pelo tenant atual.
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.prisma.rlsEnabled) return next.handle();

    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request?.user?.tenantId ?? TenantContext.tenantId;
    if (!tenantId) return next.handle();

    return from(this.prisma.withTenantTransaction(tenantId, () => lastValueFrom(next.handle())));
  }
}
