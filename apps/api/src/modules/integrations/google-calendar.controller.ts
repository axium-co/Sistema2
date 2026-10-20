import { Controller, Delete, Get, Post, Query, Redirect } from '@nestjs/common';
import { GoogleCalendarService } from './google-calendar.service';
import { Public, RequirePermission } from '../../common/auth';

@Controller('integrations/google')
export class GoogleCalendarController {
  constructor(private readonly service: GoogleCalendarService) {}

  @Get('status')
  @RequirePermission('agenda', 'view')
  status() {
    return this.service.status();
  }

  @Get('auth-url')
  @RequirePermission('agenda', 'edit')
  authUrl() {
    return this.service.authUrl();
  }

  @Post('sync')
  @RequirePermission('agenda', 'edit')
  sync() {
    return this.service.sync();
  }

  @Delete()
  @RequirePermission('agenda', 'edit')
  disconnect() {
    return this.service.disconnect();
  }

  @Public()
  @Get('callback')
  @Redirect()
  async callback(@Query('code') code: string, @Query('state') state: string) {
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
    try {
      await this.service.handleCallback(code, state);
      return { url: `${webUrl}/agenda?google=connected` };
    } catch {
      return { url: `${webUrl}/agenda?google=error` };
    }
  }
}
