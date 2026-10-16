import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { FilesService } from './files.service';
import { Public, RequirePermission, JWT_SECRET, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';
import { TenantContext } from '../../common/tenant-context';

@Controller('files')
export class FilesController {
  constructor(private readonly service: FilesService) {}

  @Get()
  @RequirePermission('arquivos', 'view')
  list(@Query() query: any) {
    return this.service.list(query);
  }

  @Get('folders')
  @RequirePermission('arquivos', 'view')
  folders() {
    return this.service.listFolders();
  }

  @Get('capabilities')
  @RequirePermission('arquivos', 'view')
  capabilities() {
    return this.service.capabilities();
  }

  @Get('quarantine')
  @RequirePermission('arquivos', 'view')
  quarantine() {
    return this.service.listQuarantined();
  }

  @Post('presign')
  @RequirePermission('arquivos', 'create')
  presign(@Body() body: { name: string; mimeType: string; folderId?: string }, @CurrentUser() user: AuthUser) {
    return this.service.presign({ ...body, userId: user.userId });
  }

  @Post(':id/complete')
  @RequirePermission('arquivos', 'create')
  complete(@Param('id') id: string) {
    return this.service.complete(id);
  }

  @Post(':id/release')
  @RequirePermission('arquivos', 'edit')
  release(@Param('id') id: string) {
    return this.service.release(id);
  }

  @Post(':id/rescan')
  @RequirePermission('arquivos', 'edit')
  rescan(@Param('id') id: string) {
    return this.service.rescan(id);
  }

  @Post('folders')
  @RequirePermission('arquivos', 'create')
  createFolder(@Body() body: { name: string; parentId?: string }, @CurrentUser() user: AuthUser) {
    return this.service.createFolder(body.name, body.parentId, user.userId);
  }

  @Delete('folders/:id')
  @RequirePermission('arquivos', 'delete')
  deleteFolder(@Param('id') id: string) {
    return this.service.deleteFolder(id);
  }

  @Get('by-entity/:entityType/:entityId')
  @RequirePermission('arquivos', 'view')
  byEntity(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.service.byEntity(entityType, entityId);
  }

  @Post('upload')
  @RequirePermission('arquivos', 'create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  upload(
    @UploadedFile() file: any,
    @CurrentUser() user: AuthUser,
    @Body() body: { folderId?: string; entityType?: string; entityId?: string },
  ) {
    return this.service.upload({ file, userId: user.userId, ...body });
  }

  @Post(':id/link')
  @RequirePermission('arquivos', 'edit')
  link(@Param('id') id: string, @Body() body: { entityType: string; entityId: string }) {
    return this.service.link(id, body.entityType, body.entityId);
  }

  @Delete('links/:linkId')
  @RequirePermission('arquivos', 'edit')
  unlink(@Param('linkId') linkId: string) {
    return this.service.unlink(linkId);
  }

  @Post(':id/trash')
  @RequirePermission('arquivos', 'delete')
  trash(@Param('id') id: string) {
    return this.service.trash(id);
  }

  @Post(':id/restore')
  @RequirePermission('arquivos', 'edit')
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }

  @Delete(':id')
  @RequirePermission('arquivos', 'delete')
  purge(@Param('id') id: string) {
    return this.service.purge(id);
  }

  @Get(':id')
  @RequirePermission('arquivos', 'view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Public()
  @Get(':id/content')
  async content(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const token = (req.query.token as string) || req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new ForbiddenException('Token ausente');
    let payload: AuthUser;
    try {
      payload = jwt.verify(token, JWT_SECRET()) as AuthUser;
    } catch {
      throw new ForbiddenException('Token inválido');
    }

    const inline = req.query.download !== 'true';
    await TenantContext.run({ tenantId: payload.tenantId, userId: payload.userId, role: payload.role }, async () => {
      const { file, stream } = await this.service.content(id);
      const disposition = inline ? 'inline' : 'attachment';
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', Number(file.sizeBytes));
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename="${encodeURIComponent(file.name)}"`,
      );
      stream.pipe(res);
    });
  }
}
