import {
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
