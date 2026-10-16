import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import * as jwt from 'jsonwebtoken';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/current-user.decorator';
import { EventBusService } from '../../common/event-bus.service';
import { Public, JWT_SECRET, type AuthUser } from '../../common/auth';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly bus: EventBusService,
  ) {}

  /**
   * Canal SSE. O EventSource do navegador não permite cabeçalhos, então o
   * access token é passado via query string (`?token=`).
   */
  @Public()
  @Sse('stream')
  stream(@Query('token') token?: string): Observable<{ data: string }> {
    let payload: AuthUser;
    try {
      payload = jwt.verify(String(token ?? ''), JWT_SECRET()) as AuthUser;
    } catch {
      throw new ForbiddenException('Token inválido');
    }

    return new Observable<{ data: string }>((subscriber) => {
      subscriber.next({ data: JSON.stringify({ type: 'connected' }) });
      const unsubscribe = this.bus.subscribe(
        EventBusService.channelForUser(payload.userId),
        (event) => subscriber.next({ data: JSON.stringify(event) }),
      );
      const keepAlive = setInterval(
        () => subscriber.next({ data: JSON.stringify({ type: 'ping' }) }),
        25000,
      );
      return () => {
        unsubscribe();
        clearInterval(keepAlive);
      };
    });
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    return this.service.list(user.userId, unread === 'true');
  }

  @Get('unread-count')
  async count(@CurrentUser() user: AuthUser) {
    return { count: await this.service.unreadCount(user.userId) };
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.markRead(id, user.userId);
  }

  @Post('read-all')
  markAll(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.userId);
  }
}
