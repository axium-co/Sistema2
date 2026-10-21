import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
  controllers: [GoogleCalendarController],
  providers: [GoogleCalendarService, AuditService],
  exports: [GoogleCalendarService],
})
export class IntegrationsModule {}
