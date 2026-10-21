import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import {
  ChangePasswordDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  TwoFactorCodeDto,
  TwoFactorDisableDto,
  TwoFactorVerifyDto,
  UpdateProfileDto,
} from './auth.dto';
import { CurrentUser } from '../../common/current-user.decorator';
import { Public, type AuthUser } from '../../common/auth';

@Controller('auth')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  private meta(req: Request) {
    return { device: req.headers['user-agent'] ?? undefined, ip: req.ip };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    const { device, ip } = this.meta(req);
    return this.auth.register(dto, device, ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const { device, ip } = this.meta(req);
    return this.auth.login(dto, device, ip);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const { device, ip } = this.meta(req);
    return this.auth.refresh(dto.refreshToken, device, ip);
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthUser, @Body() body: LogoutDto) {
    return this.auth.logout(user.userId, body?.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.userId, dto as unknown as Record<string, unknown>);
  }

  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('2fa/verify')
  verifyTwoFactor(@Body() dto: TwoFactorVerifyDto, @Req() req: Request) {
    const { device, ip } = this.meta(req);
    return this.auth.verifyTwoFactor(dto.challengeToken, dto.code, device, ip);
  }

  @Get('2fa/status')
  twoFactorStatus(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId).then((me) => ({ enabled: me.twoFactorEnabled }));
  }

  @Post('2fa/setup')
  setupTwoFactor(@CurrentUser() user: AuthUser) {
    return this.twoFactor.setup(user.userId, user.email);
  }

  @Post('2fa/enable')
  enableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactor.enable(user.userId, dto.code);
  }

  @Post('2fa/disable')
  disableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorDisableDto) {
    return this.twoFactor.disable(user.userId, dto.code);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user.userId);
  }

  @Delete('sessions/:id')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auth.revokeSession(user.userId, id);
  }
}
