import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';
import { ScannerService } from './scanner.service';
import { AuditService } from '../../common/audit.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, StorageService, ScannerService, AuditService],
})
export class FilesModule {}
