import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CrmService } from './crm.service';
import {
  CompanyDto,
  ContactDto,
  ConvertLeadDto,
  CustomFieldDto,
  CustomFieldValueDto,
  GoalDto,
  LeadDto,
  ProductDto,
  TagDto,
  UpdateCustomFieldDto,
  UpdateGoalDto,
  UpdateProductDto,
} from './crm.dto';
import { RequirePermission, type AuthUser } from '../../common/auth';
import { CurrentUser } from '../../common/current-user.decorator';

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
  convertLead(@Param('id') id: string, @Body() body: ConvertLeadDto) {
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

  // ---- Produtos ----

  @Get('products')
  @RequirePermission('crm', 'view')
  listProducts(@Query() query: any) {
    return this.service.listProducts(query);
  }

  @Post('products')
  @RequirePermission('crm', 'create')
  createProduct(@Body() dto: ProductDto) {
    return this.service.createProduct(dto);
  }

  @Patch('products/:id')
  @RequirePermission('crm', 'edit')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @RequirePermission('crm', 'delete')
  removeProduct(@Param('id') id: string) {
    return this.service.removeProduct(id);
  }

  // ---- Metas ----

  @Get('goals')
  @RequirePermission('crm', 'view')
  listGoals(@Query() query: any) {
    return this.service.listGoals(query);
  }

  @Post('goals')
  @RequirePermission('crm', 'create')
  createGoal(@Body() dto: GoalDto, @CurrentUser() user: AuthUser) {
    return this.service.createGoal(dto, user.userId);
  }

  @Patch('goals/:id')
  @RequirePermission('crm', 'edit')
  updateGoal(@Param('id') id: string, @Body() dto: UpdateGoalDto) {
    return this.service.updateGoal(id, dto);
  }

  @Delete('goals/:id')
  @RequirePermission('crm', 'delete')
  removeGoal(@Param('id') id: string) {
    return this.service.removeGoal(id);
  }

  // ---- Campos personalizados ----

  @Get('custom-fields')
  @RequirePermission('crm', 'view')
  listCustomFields(@Query('entityType') entityType?: string) {
    return this.service.listCustomFields(entityType);
  }

  @Get('custom-fields/values')
  @RequirePermission('crm', 'view')
  getCustomFieldValues(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.service.getCustomFieldValues(entityType, entityId);
  }

  @Post('custom-fields')
  @RequirePermission('crm', 'create')
  createCustomField(@Body() dto: CustomFieldDto) {
    return this.service.createCustomField(dto);
  }

  @Put('custom-fields/values')
  @RequirePermission('crm', 'edit')
  setCustomFieldValue(@Body() dto: CustomFieldValueDto) {
    return this.service.setCustomFieldValue(dto);
  }

  @Patch('custom-fields/:id')
  @RequirePermission('crm', 'edit')
  updateCustomField(@Param('id') id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.service.updateCustomField(id, dto);
  }

  @Delete('custom-fields/:id')
  @RequirePermission('crm', 'delete')
  removeCustomField(@Param('id') id: string) {
    return this.service.removeCustomField(id);
  }
}
