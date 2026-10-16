import { Module } from '@nestjs/common';
import { RoutinesController } from './routines.controller';
import { RoutinesService } from './routines.service';
import { AuditService } from '../../common/audit.service';

@Module({
  controllers: [RoutinesController],
  providers: [RoutinesService, AuditService],
})
export class RoutinesModule {}
