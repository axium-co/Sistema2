import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EventBusService } from '../../common/event-bus.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EventBusService],
  exports: [NotificationsService, EventBusService],
})
export class NotificationsModule {}
