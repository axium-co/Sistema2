import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AutomationsService } from './automations.service';
import { AutomationDto, UpdateAutomationDto } from './automations.dto';
import { RequirePermission, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('automations')
export class AutomationsController {
  constructor(private readonly service: AutomationsService) {}

  @Get()
  @RequirePermission('config', 'view')
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermission('config', 'create')
  create(@Body() dto: AutomationDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.userId);
  }

  @Patch(':id')
  @RequirePermission('config', 'edit')
  update(@Param('id') id: string, @Body() dto: UpdateAutomationDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/toggle')
  @RequirePermission('config', 'edit')
  toggle(@Param('id') id: string) {
    return this.service.toggle(id);
  }

  @Delete(':id')
  @RequirePermission('config', 'delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
