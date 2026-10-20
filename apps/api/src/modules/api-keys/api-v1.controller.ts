import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';
import { DealsService } from '../crm/deals.service';
import { CrmService } from '../crm/crm.service';
import { ApiKeyGuard } from './api-key.guard';
import { ContactApiDto, DealApiDto } from './api-keys.dto';

/**
 * API pública para integrações. Autenticada por `x-api-key` (ver ApiKeyGuard),
 * com escopos de leitura/escrita e limite de requisições por minuto.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('v1')
export class ApiV1Controller {
  constructor(
    private readonly deals: DealsService,
    private readonly crm: CrmService,
  ) {}

  @Get('me')
  me(@Req() req: Request) {
    const user = (req as any).user as AuthUser;
    return {
      tenantId: user.tenantId,
      userId: user.userId,
      role: user.role,
      key: (req as any).apiKey,
    };
  }

  @Get('deals')
  listDeals(@Query() query: any) {
    return this.deals.listDeals({
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      status: query.status,
      ownerId: query.ownerId,
      stageId: query.stageId,
      search: query.search,
    });
  }

  @Get('deals/:id')
  getDeal(@Param('id') id: string) {
    return this.deals.getDeal(id);
  }

  @Post('deals')
  async createDeal(@Body() dto: DealApiDto, @CurrentUser() user: AuthUser) {
    if (!dto.stageId) {
      const board = await this.deals.getBoard(dto.pipelineId);
      const first = board.pipeline?.stages?.[0];
      if (!first) throw new BadRequestException('Pipeline sem etapas cadastradas');
      dto.stageId = first.id;
    }
    return this.deals.createDeal(dto as any, dto.ownerId ?? user.userId);
  }

  @Get('contacts')
  listContacts(@Query() query: any) {
    return this.crm.listContacts({
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      search: query.search,
      companyId: query.companyId,
    });
  }

  @Post('contacts')
  createContact(@Body() dto: ContactApiDto) {
    return this.crm.createContact(dto as any);
  }

  @Get('pipelines')
  pipelines() {
    return this.deals.listPipelines();
  }
}
