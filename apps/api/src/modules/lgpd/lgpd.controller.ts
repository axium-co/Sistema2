import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { LgpdService } from './lgpd.service';
import { ConsentDto, EraseDto, SubjectDto } from './lgpd.dto';
import { RequirePermission, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.ip;
}

@Controller('lgpd')
export class LgpdController {
  constructor(private readonly service: LgpdService) {}

  @Get('me')
  myData(@CurrentUser() user: AuthUser) {
    return this.service.myData(user.userId);
  }

  @Get('consents')
  @RequirePermission('config', 'view')
  listConsents(@Query('subjectType') subjectType?: string, @Query('subjectId') subjectId?: string) {
    return this.service.listConsents(subjectType, subjectId);
  }

  @Post('consents')
  @RequirePermission('config', 'create')
  grantConsent(@Body() dto: ConsentDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.service.grantConsent(dto, { actorId: user.userId, ip: clientIp(req) });
  }

  @Post('consents/:id/revoke')
  @RequirePermission('config', 'edit')
  revokeConsent(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.service.revokeConsent(id, { actorId: user.userId, ip: clientIp(req) });
  }

  @Get('requests')
  @RequirePermission('config', 'view')
  listRequests() {
    return this.service.listRequests();
  }

  @Post('export')
  @RequirePermission('config', 'export')
  exportSubject(@Body() dto: SubjectDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.service.exportSubject(dto.subjectType, dto.subjectId, { actorId: user.userId, ip: clientIp(req) });
  }

  @Post('anonymize')
  @RequirePermission('config', 'delete')
  anonymize(@Body() dto: EraseDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.service.anonymizeSubject(dto.subjectType, dto.subjectId, dto.erase ?? false, {
      actorId: user.userId,
      ip: clientIp(req),
    });
  }
}
