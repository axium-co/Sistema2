import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { BoardsService } from './boards.service';
import {
  AddCardLabelDto,
  AssignCardDto,
  BoardDto,
  CardDto,
  ChecklistDto,
  ChecklistItemDto,
  CommentDto,
  LabelDto,
  ListDto,
  MoveCardDto,
  UpdateCardDto,
  UpdateChecklistItemDto,
} from './boards.dto';
import { RequirePermission, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('boards')
export class BoardsController {
  constructor(private readonly service: BoardsService) {}

  @Get()
  @RequirePermission('tarefas', 'view')
  list() {
    return this.service.listBoards();
  }

  @Post()
  @RequirePermission('tarefas', 'create')
  create(@Body() dto: BoardDto, @CurrentUser() user: AuthUser) {
    return this.service.createBoard(dto, user.userId);
  }

  @Get('cards')
  @RequirePermission('tarefas', 'view')
  listCards(@Query() query: any) {
    return this.service.listCards(query);
  }

  @Get('cards/:id')
  @RequirePermission('tarefas', 'view')
  getCard(@Param('id') id: string) {
    return this.service.getCard(id);
  }

  @Patch('cards/:id')
  @RequirePermission('tarefas', 'edit')
  updateCard(@Param('id') id: string, @Body() dto: UpdateCardDto) {
    return this.service.updateCard(id, dto);
  }

  @Patch('cards/:id/move')
  @RequirePermission('tarefas', 'edit')
  moveCard(@Param('id') id: string, @Body() dto: MoveCardDto) {
    return this.service.moveCard(id, dto);
  }

  @Delete('cards/:id')
  @RequirePermission('tarefas', 'delete')
  archiveCard(@Param('id') id: string) {
    return this.service.archiveCard(id);
  }

  @Post('cards/:id/assignees')
  @RequirePermission('tarefas', 'edit')
  assign(@Param('id') id: string, @Body() body: AssignCardDto) {
    return this.service.assign(id, body.userId);
  }

  @Delete('cards/:id/assignees/:userId')
  @RequirePermission('tarefas', 'edit')
  unassign(@Param('id') id: string, @Param('userId') userId: string) {
    return this.service.unassign(id, userId);
  }

  @Post('cards/:id/labels')
  @RequirePermission('tarefas', 'edit')
  addLabel(@Param('id') id: string, @Body() body: AddCardLabelDto) {
    return this.service.addLabel(id, body.labelId);
  }

  @Delete('cards/:id/labels/:labelId')
  @RequirePermission('tarefas', 'edit')
  removeLabel(@Param('id') id: string, @Param('labelId') labelId: string) {
    return this.service.removeLabel(id, labelId);
  }

  @Post('cards/:id/checklists')
  @RequirePermission('tarefas', 'edit')
  createChecklist(@Param('id') id: string, @Body() dto: ChecklistDto) {
    return this.service.createChecklist(id, dto);
  }

  @Post('cards/:id/comments')
  @RequirePermission('tarefas', 'create')
  comment(@Param('id') id: string, @Body() dto: CommentDto, @CurrentUser() user: AuthUser) {
    return this.service.addComment(id, dto, user.userId);
  }

  @Post('checklists/:id/items')
  @RequirePermission('tarefas', 'edit')
  createChecklistItem(@Param('id') id: string, @Body() dto: ChecklistItemDto) {
    return this.service.createChecklistItem(id, dto);
  }

  @Patch('checklist-items/:id')
  @RequirePermission('tarefas', 'edit')
  updateChecklistItem(@Param('id') id: string, @Body() dto: UpdateChecklistItemDto) {
    return this.service.updateChecklistItem(id, dto);
  }

  @Delete('checklist-items/:id')
  @RequirePermission('tarefas', 'edit')
  deleteChecklistItem(@Param('id') id: string) {
    return this.service.deleteChecklistItem(id);
  }

  @Get(':id')
  @RequirePermission('tarefas', 'view')
  get(@Param('id') id: string) {
    return this.service.getBoard(id);
  }

  @Patch(':id')
  @RequirePermission('tarefas', 'edit')
  update(@Param('id') id: string, @Body() dto: BoardDto) {
    return this.service.updateBoard(id, dto);
  }

  @Delete(':id')
  @RequirePermission('tarefas', 'delete')
  archive(@Param('id') id: string) {
    return this.service.archiveBoard(id);
  }

  @Post(':id/lists')
  @RequirePermission('tarefas', 'create')
  createList(@Param('id') id: string, @Body() dto: ListDto) {
    return this.service.createList(id, dto);
  }

  @Patch('lists/:id')
  @RequirePermission('tarefas', 'edit')
  updateList(@Param('id') id: string, @Body() dto: ListDto) {
    return this.service.updateList(id, dto);
  }

  @Delete('lists/:id')
  @RequirePermission('tarefas', 'delete')
  archiveList(@Param('id') id: string) {
    return this.service.archiveList(id);
  }

  @Post('lists/:id/cards')
  @RequirePermission('tarefas', 'create')
  createCard(@Param('id') id: string, @Body() dto: CardDto) {
    return this.service.createCard(id, dto);
  }

  @Post(':id/labels')
  @RequirePermission('tarefas', 'create')
  createLabel(@Param('id') id: string, @Body() dto: LabelDto) {
    return this.service.createLabel(id, dto);
  }
}
