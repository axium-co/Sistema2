import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
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
import { HealthController } from './health.controller';
import { JwtAuthGuard, PermissionsGuard } from './common/auth';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
