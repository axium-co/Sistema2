import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AUTOMATION_ACTIONS, AUTOMATION_TRIGGERS } from './automations.service';

export class AutomationDto {
  @IsString() @MinLength(1) name: string;
  @IsIn(AUTOMATION_TRIGGERS as unknown as string[]) trigger: string;
  @IsOptional() @IsObject() conditions?: Record<string, unknown>;
  @IsIn(AUTOMATION_ACTIONS as unknown as string[]) action: string;
  @IsOptional() @IsObject() actionConfig?: Record<string, unknown>;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateAutomationDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsIn(AUTOMATION_TRIGGERS as unknown as string[]) trigger?: string;
  @IsOptional() @IsObject() conditions?: Record<string, unknown>;
  @IsOptional() @IsIn(AUTOMATION_ACTIONS as unknown as string[]) action?: string;
  @IsOptional() @IsObject() actionConfig?: Record<string, unknown>;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
