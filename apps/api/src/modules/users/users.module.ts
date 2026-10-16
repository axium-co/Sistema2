import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { InvitationsService } from './invitations.service';
import { AuditService } from '../../common/audit.service';
import { MailerService } from '../../common/mailer.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [NotificationsModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService, InvitationsService, AuditService, MailerService],
})
export class UsersModule {}
