import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { AuditService } from '../../common/audit.service';

@Module({
  controllers: [ImportController],
  providers: [ImportService, AuditService],
})
export class ImportModule {}
