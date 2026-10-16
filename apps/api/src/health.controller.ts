import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return { status: 'ok', service: 'axium-api', time: new Date().toISOString() };
  }
}
