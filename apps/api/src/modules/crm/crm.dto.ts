import {
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ACTIVITY_TYPES, DEAL_STATUSES, LEAD_STATUSES } from '@axium/shared';
import type { ActivityType, DealStatus, LeadStatus } from '@axium/shared';

export class CompanyDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() cnpj?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() ownerId?: string;
}

export class ContactDto {
  @IsString() @MinLength(1) fullName: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsString() cpf?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() ownerId?: string;
}

export class LeadDto {
  @IsString() contactId: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsIn(LEAD_STATUSES as unknown as string[]) status?: LeadStatus;
  @IsOptional() @IsString() notes?: string;
}

export class TagDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() color?: string;
}

export class PipelineDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class StageDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsNumber() position?: number;
  @IsOptional() @IsNumber() probability?: number;
}

export class DealItemDto {
  @IsOptional() @IsString() productId?: string;
  @IsString() description: string;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsNumber() unitPrice?: number;
}

export class DealDto {
  @IsString() @MinLength(1) title: string;
  @IsOptional() @IsString() pipelineId?: string;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() primaryContactId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() expectedCloseDate?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DealItemDto) items?: DealItemDto[];
}

export class MoveDealDto {
  @IsString() stageId: string;
  @IsOptional() @IsIn(DEAL_STATUSES as unknown as string[]) status?: DealStatus;
  @IsOptional() @IsString() lossReason?: string;
  @IsOptional() @IsNumber() finalAmount?: number;
}

export class ActivityDto {
  @IsIn(ACTIVITY_TYPES as unknown as string[]) type: ActivityType;
  @IsString() @MinLength(1) subject: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsIn(['PENDING', 'DONE', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() dueAt?: string;
  @IsOptional() @IsString() occurredAt?: string;
}

export class NoteDto {
  @IsString() entityType: string;
  @IsString() entityId: string;
  @IsString() @MinLength(1) body: string;
}

export class ProductDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class GoalDto {
  @IsOptional() @IsString() ownerId?: string;
  @IsString() @MinLength(1) metric: string;
  @IsNumber() target: number;
  @IsString() periodStart: string;
  @IsString() periodEnd: string;
}

export class CustomFieldDto {
  @IsString() @MinLength(1) entityType: string;
  @IsString() @MinLength(1) label: string;
  @IsIn(['text', 'number', 'date', 'select', 'boolean']) type: string;
  @IsOptional() @Allow() options?: unknown;
  @IsOptional() @IsNumber() position?: number;
}

export class CustomFieldValueDto {
  @IsString() customFieldId: string;
  @IsString() entityId: string;
  @Allow() value: unknown;
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsString() sku?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateGoalDto {
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() metric?: string;
  @IsOptional() @IsNumber() target?: number;
  @IsOptional() @IsString() periodStart?: string;
  @IsOptional() @IsString() periodEnd?: string;
}

export class UpdateCustomFieldDto {
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @Allow() options?: unknown;
  @IsOptional() @IsNumber() position?: number;
}

export class ConvertLeadDto {
  @IsString() @MinLength(1) pipelineId: string;
  @IsString() @MinLength(1) stageId: string;
  @IsString() @MinLength(1) ownerId: string;
}
