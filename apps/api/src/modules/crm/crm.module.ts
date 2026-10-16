import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { DealsController } from './deals.controller';
import { CrmService } from './crm.service';
import { DealsService } from './deals.service';
import { AuditService } from '../../common/audit.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CrmController, DealsController],
  providers: [CrmService, DealsService, AuditService],
})
export class CrmModule {}
