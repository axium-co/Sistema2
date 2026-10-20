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
  'AutomationRule',
  'ConsentRecord',
  'DataRequest',
  'ApiKey',
  'Subscription',
  'Invoice',
  'CalendarIntegration',
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
  public readonly rlsEnabled = process.env.RLS_ENABLED === 'true';

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

  /**
   * Executa a requisição dentro de uma transação com `app.tenant_id` definido
   * localmente (SET LOCAL / set_config), permitindo que as políticas de RLS do
   * banco (prisma/rls-enforce.sql) filtrem as linhas pelo tenant atual.
   *
   * Quando RLS_ENABLED=false apenas executa `fn` sem transação.
   */
  async withTenantTransaction<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    if (!this.rlsEnabled) return fn();
    return this.$transaction(
      async (tx: any) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId);
        const store = TenantContext.get() ?? {};
        return TenantContext.run({ ...store, tenantId, tx }, fn);
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
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
              throw new ForbiddenException(`Operação sem contexto de empresa (tenant): ${model}.${operation}`);
            }

            const a = (args ?? {}) as AnyArgs;

            // Com RLS ativo, todas as operações passam pelo cliente de transação
            // (que já tem `app.tenant_id` definido via set_config local).
            const exec = (finalArgs: AnyArgs) =>
              store?.tx ? (store.tx as any)[model][operation](finalArgs) : query(finalArgs);

            if (operation === 'create') {
              a.data = { ...a.data, tenantId };
              return exec(a);
            }

            if (operation === 'createMany') {
              const data = Array.isArray(a.data) ? a.data : [a.data];
              a.data = data.map((d: AnyArgs) => ({ ...d, tenantId }));
              return exec(a);
            }

            if (LIST_OPERATIONS.has(operation)) {
              a.where = { ...(a.where ?? {}), tenantId };
              return exec(a);
            }

            return exec(a);
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
