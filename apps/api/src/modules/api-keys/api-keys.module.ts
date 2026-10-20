import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyGuard } from './api-key.guard';
import { ApiV1Controller } from './api-v1.controller';

@Module({
  imports: [CrmModule],
  controllers: [ApiKeysController, ApiV1Controller],
  providers: [ApiKeysService, ApiKeyGuard],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
