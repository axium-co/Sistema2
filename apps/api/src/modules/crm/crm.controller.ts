import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CompanyDto, ContactDto, LeadDto, TagDto } from './crm.dto';
import { RequirePermission } from '../../common/auth';

@Controller('crm')
export class CrmController {
  constructor(private readonly service: CrmService) {}

  @Get('companies')
  @RequirePermission('crm', 'view')
  listCompanies(@Query() query: any) {
    return this.service.listCompanies(query);
  }

  @Get('companies/:id')
  @RequirePermission('crm', 'view')
  getCompany(@Param('id') id: string) {
    return this.service.getCompany(id);
  }

  @Post('companies')
  @RequirePermission('crm', 'create')
  createCompany(@Body() dto: CompanyDto) {
    return this.service.createCompany(dto);
  }

  @Patch('companies/:id')
  @RequirePermission('crm', 'edit')
  updateCompany(@Param('id') id: string, @Body() dto: CompanyDto) {
    return this.service.updateCompany(id, dto);
  }

  @Delete('companies/:id')
  @RequirePermission('crm', 'delete')
  removeCompany(@Param('id') id: string) {
    return this.service.removeCompany(id);
  }

  @Get('contacts')
  @RequirePermission('crm', 'view')
  listContacts(@Query() query: any) {
    return this.service.listContacts(query);
  }

  @Get('contacts/:id')
  @RequirePermission('crm', 'view')
  getContact(@Param('id') id: string) {
    return this.service.getContact(id);
  }

  @Post('contacts')
  @RequirePermission('crm', 'create')
  createContact(@Body() dto: ContactDto) {
    return this.service.createContact(dto);
  }

  @Patch('contacts/:id')
  @RequirePermission('crm', 'edit')
  updateContact(@Param('id') id: string, @Body() dto: ContactDto) {
    return this.service.updateContact(id, dto);
  }

  @Delete('contacts/:id')
  @RequirePermission('crm', 'delete')
  removeContact(@Param('id') id: string) {
    return this.service.removeContact(id);
  }

  @Get('leads')
  @RequirePermission('crm', 'view')
  listLeads(@Query() query: any) {
    return this.service.listLeads(query);
  }

  @Post('leads')
  @RequirePermission('crm', 'create')
  createLead(@Body() dto: LeadDto) {
    return this.service.createLead(dto);
  }

  @Patch('leads/:id')
  @RequirePermission('crm', 'edit')
  updateLead(@Param('id') id: string, @Body() dto: LeadDto) {
    return this.service.updateLead(id, dto);
  }

  @Post('leads/:id/convert')
  @RequirePermission('crm', 'edit')
  convertLead(@Param('id') id: string, @Body() body: { pipelineId: string; stageId: string; ownerId: string }) {
    return this.service.convertLead(id, body);
  }

  @Delete('leads/:id')
  @RequirePermission('crm', 'delete')
  removeLead(@Param('id') id: string) {
    return this.service.removeLead(id);
  }

  @Get('tags')
  @RequirePermission('crm', 'view')
  listTags() {
    return this.service.listTags();
  }

  @Post('tags')
  @RequirePermission('crm', 'create')
  createTag(@Body() dto: TagDto) {
    return this.service.createTag(dto);
  }

  @Delete('tags/:id')
  @RequirePermission('crm', 'delete')
  removeTag(@Param('id') id: string) {
    return this.service.removeTag(id);
  }
}
