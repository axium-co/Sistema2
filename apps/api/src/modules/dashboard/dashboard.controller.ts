import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RequirePermission, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('my-day')
  @RequirePermission('relatorios', 'view')
  myDay(@CurrentUser() user: AuthUser) {
    return this.service.myDay(user.userId);
  }

  @Get('funnel')
  @RequirePermission('relatorios', 'view')
  funnel() {
    return this.service.pipelineFunnel();
  }

  @Get('leads-by-source')
  @RequirePermission('relatorios', 'view')
  leadsBySource() {
    return this.service.leadsBySource();
  }
}
