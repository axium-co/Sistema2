import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyDto } from './api-keys.dto';
import { RequirePermission, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  @RequirePermission('config', 'view')
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermission('config', 'create')
  create(@Body() dto: ApiKeyDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.userId);
  }

  @Delete(':id')
  @RequirePermission('config', 'delete')
  revoke(@Param('id') id: string) {
    return this.service.revoke(id);
  }
}
