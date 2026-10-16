import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ImportService } from './import.service';
import { RequirePermission, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('import')
export class ImportController {
  constructor(private readonly service: ImportService) {}

  @Get('template/:entity')
  @RequirePermission('crm', 'view')
  template(@Param('entity') entity: string, @Res() res: Response) {
    const { filename, content } = this.service.template(entity);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @Post(':entity')
  @RequirePermission('crm', 'create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  run(
    @Param('entity') entity: string,
    @UploadedFile() file: any,
    @CurrentUser() user: AuthUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.run(entity, file?.buffer, user.userId, dryRun === 'true');
  }
}
