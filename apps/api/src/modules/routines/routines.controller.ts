import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import {
  FocusStartDto,
  FocusStopDto,
  HabitDto,
  HabitLogDto,
  RoutineDto,
  RoutineItemDto,
  TimeBlockDto,
  ToggleRunItemDto,
  UpdateHabitDto,
  UpdateRoutineDto,
  UpdateRoutineItemDto,
  UpdateTimeBlockDto,
} from './routines.dto';
import { RequirePermission, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('routines')
export class RoutinesController {
  constructor(private readonly service: RoutinesService) {}

  // ---------- Planejador ----------
  @Get('plan')
  @RequirePermission('rotina', 'view')
  plan(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.service.dailyPlan(user.userId, date);
  }

  @Get('review/weekly')
  @RequirePermission('rotina', 'view')
  weeklyReview(@CurrentUser() user: AuthUser) {
    return this.service.weeklyReview(user.userId);
  }

  @Get('stats')
  @RequirePermission('rotina', 'view')
  stats(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.service.routineStats(user.userId, days ? Number(days) : undefined);
  }

  // ---------- Habitos ----------
  @Get('habits')
  @RequirePermission('rotina', 'view')
  listHabits(@CurrentUser() user: AuthUser) {
    return this.service.listHabits(user.userId);
  }

  @Post('habits')
  @RequirePermission('rotina', 'create')
  createHabit(@Body() dto: HabitDto, @CurrentUser() user: AuthUser) {
    return this.service.createHabit(dto, user.userId);
  }

  @Patch('habits/:id')
  @RequirePermission('rotina', 'edit')
  updateHabit(@Param('id') id: string, @Body() dto: UpdateHabitDto, @CurrentUser() user: AuthUser) {
    return this.service.updateHabit(id, dto, user.userId);
  }

  @Delete('habits/:id')
  @RequirePermission('rotina', 'delete')
  removeHabit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeHabit(id, user.userId);
  }

  @Post('habits/:id/logs')
  @RequirePermission('rotina', 'create')
  toggleHabitLog(@Param('id') id: string, @Body() dto: HabitLogDto, @CurrentUser() user: AuthUser) {
    return this.service.toggleHabitLog(id, dto, user.userId);
  }

  @Get('habits/:id/stats')
  @RequirePermission('rotina', 'view')
  habitStats(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.habitStats(id, user.userId);
  }

  // ---------- Blocos de tempo ----------
  @Get('time-blocks')
  @RequirePermission('rotina', 'view')
  listTimeBlocks(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listTimeBlocks(user.userId, date, from, to);
  }

  @Post('time-blocks')
  @RequirePermission('rotina', 'create')
  createTimeBlock(@Body() dto: TimeBlockDto, @CurrentUser() user: AuthUser) {
    return this.service.createTimeBlock(dto, user.userId);
  }

  @Patch('time-blocks/:id')
  @RequirePermission('rotina', 'edit')
  updateTimeBlock(@Param('id') id: string, @Body() dto: UpdateTimeBlockDto, @CurrentUser() user: AuthUser) {
    return this.service.updateTimeBlock(id, dto, user.userId);
  }

  @Delete('time-blocks/:id')
  @RequirePermission('rotina', 'delete')
  removeTimeBlock(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeTimeBlock(id, user.userId);
  }

  // ---------- Foco (Pomodoro) ----------
  @Get('focus/current')
  @RequirePermission('rotina', 'view')
  currentFocus(@CurrentUser() user: AuthUser) {
    return this.service.currentFocus(user.userId);
  }

  @Get('focus/stats')
  @RequirePermission('rotina', 'view')
  focusStats(@CurrentUser() user: AuthUser) {
    return this.service.focusStats(user.userId);
  }

  @Get('focus/sessions')
  @RequirePermission('rotina', 'view')
  listFocus(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.listFocusSessions(user.userId, from, to);
  }

  @Post('focus/start')
  @RequirePermission('rotina', 'create')
  startFocus(@Body() dto: FocusStartDto, @CurrentUser() user: AuthUser) {
    return this.service.startFocus(dto, user.userId);
  }

  @Post('focus/:id/stop')
  @RequirePermission('rotina', 'create')
  stopFocus(@Param('id') id: string, @Body() dto: FocusStopDto, @CurrentUser() user: AuthUser) {
    return this.service.stopFocus(id, dto, user.userId);
  }

  // ---------- Execucao de rotinas ----------
  @Patch('runs/:runId/items/:itemId')
  @RequirePermission('rotina', 'edit')
  toggleRunItem(
    @Param('runId') runId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ToggleRunItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.toggleRunItem(runId, itemId, dto.checked, user.userId);
  }

  @Post('runs/:runId/complete')
  @RequirePermission('rotina', 'edit')
  completeRun(@Param('runId') runId: string, @CurrentUser() user: AuthUser) {
    return this.service.completeRun(runId, user.userId);
  }

  // ---------- Itens de rotina ----------
  @Patch('items/:itemId')
  @RequirePermission('rotina', 'edit')
  updateItem(@Param('itemId') itemId: string, @Body() dto: UpdateRoutineItemDto, @CurrentUser() user: AuthUser) {
    return this.service.updateItem(itemId, dto, user.userId);
  }

  @Delete('items/:itemId')
  @RequirePermission('rotina', 'delete')
  removeItem(@Param('itemId') itemId: string, @CurrentUser() user: AuthUser) {
    return this.service.removeItem(itemId, user.userId);
  }

  // ---------- Rotinas ----------
  @Get()
  @RequirePermission('rotina', 'view')
  list(@CurrentUser() user: AuthUser) {
    return this.service.listRoutines(user.userId);
  }

  @Post()
  @RequirePermission('rotina', 'create')
  create(@Body() dto: RoutineDto, @CurrentUser() user: AuthUser) {
    return this.service.createRoutine(dto, user.userId);
  }

  @Get(':id')
  @RequirePermission('rotina', 'view')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getRoutine(id, user.userId);
  }

  @Patch(':id')
  @RequirePermission('rotina', 'edit')
  update(@Param('id') id: string, @Body() dto: UpdateRoutineDto, @CurrentUser() user: AuthUser) {
    return this.service.updateRoutine(id, dto, user.userId);
  }

  @Delete(':id')
  @RequirePermission('rotina', 'delete')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeRoutine(id, user.userId);
  }

  @Post(':id/items')
  @RequirePermission('rotina', 'edit')
  addItem(@Param('id') id: string, @Body() dto: RoutineItemDto, @CurrentUser() user: AuthUser) {
    return this.service.addItem(id, dto, user.userId);
  }

  @Post(':id/clone')
  @RequirePermission('rotina', 'create')
  clone(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.cloneRoutine(id, user.userId);
  }
}
