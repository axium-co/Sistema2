import { Injectable, Module, Global, OnModuleDestroy, OnModuleInit, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { TenantContext } from '../common/tenant-context';

const TENANT_MODELS = new Set([
  'User',
  'Team',
  'AuditLog',
  'Company',
  'Contact',
  'Lead',
  'Pipeline',
  'Deal',
  'Product',
  'Activity',
  'Note',
  'Tag',
  'Goal',
  'Calendar',
  'Event',
  'Routine',
  'RoutineRun',
  'Habit',
  'TimeBlock',
  'FocusSession',
  'Board',
  'Card',
  'Folder',
  'File',
  'Notification',
  'CustomField',
  'Label',
]);

const LIST_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

type AnyArgs = Record<string, any>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * Client com escopo automático de tenant.
   * - create/createMany: injeta tenantId a partir do contexto da requisição
   * - listagens/updates em massa: injeta tenantId no where
   * - qualquer operação de modelo de negócio sem contexto de tenant é rejeitada
   *   (a menos que allowUnscoped esteja ativo, usado apenas pelo fluxo de autenticação)
   */
  public readonly db: any;

  constructor() {
    super();
    this.db = this.buildTenantScoped();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Busca por id garantindo que o registro pertence ao tenant atual. */
  async findByIdOrFail(model: string, id: string, include?: AnyArgs) {
    const record = await this.db[model].findFirst({ where: { id }, ...(include ?? {}) });
    if (!record) {
      throw new NotFoundException('Registro não encontrado');
    }
    return record;
  }

  private buildTenantScoped() {
    return this.$extends({
      name: 'tenant-scope',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: any) {
            if (!model || !TENANT_MODELS.has(model)) {
              return query(args);
            }
            const store = TenantContext.get();
            const tenantId = store?.tenantId;

            if (!tenantId) {
              if (store?.allowUnscoped) {
                return query(args);
              }
              throw new ForbiddenException('Operação sem contexto de empresa (tenant)');
            }

            const a = (args ?? {}) as AnyArgs;

            if (operation === 'create') {
              a.data = { ...a.data, tenantId };
              return query(a);
            }

            if (operation === 'createMany') {
              const data = Array.isArray(a.data) ? a.data : [a.data];
              a.data = data.map((d: AnyArgs) => ({ ...d, tenantId }));
              return query(a);
            }

            if (LIST_OPERATIONS.has(operation)) {
              a.where = { ...(a.where ?? {}), tenantId };
              return query(a);
            }

            return query(a);
          },
        },
      } as any,
    });
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
