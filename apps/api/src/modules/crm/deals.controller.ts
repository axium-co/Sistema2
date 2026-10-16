import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DealsService } from './deals.service';
import { ActivityDto, DealDto, MoveDealDto, NoteDto, PipelineDto, StageDto } from './crm.dto';
import { RequirePermission, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('deals')
export class DealsController {
  constructor(private readonly service: DealsService) {}

  @Get('pipelines')
  @RequirePermission('crm', 'view')
  pipelines() {
    return this.service.listPipelines();
  }

  @Post('pipelines')
  @RequirePermission('crm', 'create')
  createPipeline(@Body() dto: PipelineDto) {
    return this.service.createPipeline(dto);
  }

  @Get('board')
  @RequirePermission('crm', 'view')
  board(@Query('pipelineId') pipelineId?: string) {
    return this.service.getBoard(pipelineId);
  }

  @Post('pipelines/:id/stages')
  @RequirePermission('crm', 'create')
  createStage(@Param('id') id: string, @Body() dto: StageDto) {
    return this.service.createStage(id, dto);
  }

  @Patch('stages/:id')
  @RequirePermission('crm', 'edit')
  updateStage(@Param('id') id: string, @Body() dto: StageDto) {
    return this.service.updateStage(id, dto);
  }

  @Get()
  @RequirePermission('crm', 'view')
  list(@Query() query: any) {
    return this.service.listDeals(query);
  }

  @Post()
  @RequirePermission('crm', 'create')
  create(@Body() dto: DealDto, @CurrentUser() user: AuthUser) {
    return this.service.createDeal(dto, user.userId);
  }

  @Get('activities')
  @RequirePermission('crm', 'view')
  activities(@Query() query: any) {
    return this.service.listActivities(query);
  }

  @Post('activities')
  @RequirePermission('crm', 'create')
  createActivity(@Body() dto: ActivityDto, @CurrentUser() user: AuthUser) {
    return this.service.createActivity(dto, user.userId);
  }

  @Post('activities/:id/complete')
  @RequirePermission('crm', 'edit')
  completeActivity(@Param('id') id: string) {
    return this.service.completeActivity(id);
  }

  @Delete('activities/:id')
  @RequirePermission('crm', 'delete')
  removeActivity(@Param('id') id: string) {
    return this.service.removeActivity(id);
  }

  @Get('notes')
  @RequirePermission('crm', 'view')
  notes(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.service.listNotes(entityType, entityId);
  }

  @Post('notes')
  @RequirePermission('crm', 'create')
  createNote(@Body() dto: NoteDto, @CurrentUser() user: AuthUser) {
    return this.service.createNote(dto, user.userId);
  }

  @Get('timeline/:entityType/:entityId')
  @RequirePermission('crm', 'view')
  timeline(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.service.timeline(entityType, entityId);
  }

  @Get(':id')
  @RequirePermission('crm', 'view')
  get(@Param('id') id: string) {
    return this.service.getDeal(id);
  }

  @Patch(':id')
  @RequirePermission('crm', 'edit')
  update(@Param('id') id: string, @Body() dto: DealDto) {
    return this.service.updateDeal(id, dto);
  }

  @Patch(':id/move')
  @RequirePermission('crm', 'edit')
  move(@Param('id') id: string, @Body() dto: MoveDealDto) {
    return this.service.moveDeal(id, dto);
  }

  @Delete(':id')
  @RequirePermission('crm', 'delete')
  remove(@Param('id') id: string) {
    return this.service.removeDeal(id);
  }
}
