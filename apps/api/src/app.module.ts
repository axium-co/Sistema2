import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CrmModule } from './modules/crm/crm.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { RoutinesModule } from './modules/routines/routines.module';
import { BoardsModule } from './modules/boards/boards.module';
import { FilesModule } from './modules/files/files.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SearchModule } from './modules/search/search.module';
import { ImportModule } from './modules/import/import.module';
import { AutomationsModule } from './modules/automations/automations.module';
import { LgpdModule } from './modules/lgpd/lgpd.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { BillingModule } from './modules/billing/billing.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { HealthController } from './health.controller';
import { JwtAuthGuard, PermissionsGuard } from './common/auth';
import { RlsInterceptor } from './common/rls.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }] }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CrmModule,
    AgendaModule,
    RoutinesModule,
    BoardsModule,
    FilesModule,
    DashboardModule,
    NotificationsModule,
    SearchModule,
    ImportModule,
    AutomationsModule,
    LgpdModule,
    ApiKeysModule,
    BillingModule,
    IntegrationsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: RlsInterceptor },
  ],
})
export class AppModule {}
