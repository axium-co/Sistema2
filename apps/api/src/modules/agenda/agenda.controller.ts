import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { EventDto, UpdateEventDto } from './agenda.dto';
import { RequirePermission, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly service: AgendaService) {}

  @Get('calendars')
  @RequirePermission('agenda', 'view')
  calendars(@CurrentUser() user: AuthUser) {
    return this.service.listCalendars(user.userId);
  }

  @Get('events')
  @RequirePermission('agenda', 'view')
  events(@Query() query: any) {
    return this.service.listEvents(query);
  }

  @Get('events/:id')
  @RequirePermission('agenda', 'view')
  get(@Param('id') id: string) {
    return this.service.getEvent(id);
  }

  @Post('events')
  @RequirePermission('agenda', 'create')
  create(@Body() dto: EventDto, @CurrentUser() user: AuthUser) {
    return this.service.createEvent(dto, user.userId);
  }

  @Patch('events/:id')
  @RequirePermission('agenda', 'edit')
  update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.service.updateEvent(id, dto);
  }

  @Delete('events/:id')
  @RequirePermission('agenda', 'delete')
  remove(@Param('id') id: string) {
    return this.service.removeEvent(id);
  }

  @Get('suggest-slots')
  @RequirePermission('agenda', 'view')
  suggest(@Query('date') date: string, @Query('duration') duration?: string) {
    return this.service.suggestSlots(date, duration ? Number(duration) : 60);
  }
}
