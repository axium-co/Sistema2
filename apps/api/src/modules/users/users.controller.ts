import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { InvitationsService } from './invitations.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { RequirePermission, Public, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';
import type { Role } from '@axium/shared';
import { ROLES } from '@axium/shared';

class InviteDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsIn(ROLES as unknown as string[]) role: Role;
  @IsString() @MinLength(8) password: string;
  @IsOptional() @IsString() teamId?: string;
}

class UpdateRoleDto {
  @IsIn(ROLES as unknown as string[]) role: Role;
}

class TeamDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() leadId?: string;
}

class CreateInvitationDto {
  @IsEmail() email: string;
  @IsOptional() @IsString() name?: string;
  @IsIn(ROLES as unknown as string[]) role: Role;
}

class AcceptInvitationDto {
  @IsString() token: string;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsString() @MinLength(8) password: string;
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly service: UsersService,
    private readonly invitations: InvitationsService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  private meta(req: Request) {
    return { device: req.headers['user-agent'] ?? undefined, ip: req.ip };
  }

  @Get()
  @RequirePermission('config', 'view')
  list() {
    return this.service.list();
  }

  @Post('invite')
  @RequirePermission('config', 'create')
  invite(@Body() dto: InviteDto, @CurrentUser() user: AuthUser) {
    return this.service.invite(dto, user.userId);
  }

  // ---- Convites por e-mail ----

  @Get('invitations')
  @RequirePermission('config', 'view')
  listInvitations() {
    return this.invitations.list();
  }

  @Post('invitations')
  @RequirePermission('config', 'create')
  createInvitation(@Body() dto: CreateInvitationDto, @CurrentUser() user: AuthUser) {
    return this.invitations.create(dto, user.userId);
  }

  @Delete('invitations/:id')
  @RequirePermission('config', 'delete')
  revokeInvitation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.invitations.revoke(id, user.userId);
  }

  @Public()
  @Get('invitations/preview')
  previewInvitation(@Req() req: Request) {
    return this.invitations.preview(String(req.query.token ?? ''));
  }

  @Public()
  @Post('invitations/accept')
  acceptInvitation(@Body() dto: AcceptInvitationDto, @Req() req: Request) {
    const { device, ip } = this.meta(req);
    return this.invitations.accept(dto, device, ip);
  }

  @Patch(':id/role')
  @RequirePermission('config', 'edit')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() user: AuthUser) {
    return this.service.updateRole(id, dto.role, user.userId);
  }

  @Post(':id/2fa/reset')
  @RequirePermission('config', 'edit')
  resetTwoFactor(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.twoFactor.resetFor(id, user.userId);
  }

  @Delete(':id')
  @RequirePermission('config', 'delete')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.userId);
  }

  @Get('teams/list')
  @RequirePermission('config', 'view')
  teams() {
    return this.service.teams();
  }

  @Post('teams')
  @RequirePermission('config', 'create')
  createTeam(@Body() dto: TeamDto) {
    return this.service.createTeam(dto.name, dto.leadId);
  }
}
