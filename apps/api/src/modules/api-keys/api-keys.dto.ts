import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { API_KEY_SCOPES } from './api-keys.service';

export class ApiKeyDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsIn(API_KEY_SCOPES as unknown as string[], { each: true }) scopes?: string[];
  @IsOptional() @IsString() expiresAt?: string;
}

export class DealApiDto {
  @IsString() @MinLength(1) title: string;
  @IsString() pipelineId: string;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() primaryContactId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() amount?: number;
  @IsOptional() @IsString() expectedCloseDate?: string;
}

export class ContactApiDto {
  @IsString() @MinLength(1) fullName: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() companyId?: string;
}
