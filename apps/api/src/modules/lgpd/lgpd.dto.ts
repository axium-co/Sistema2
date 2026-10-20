import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CONSENT_PURPOSES, LGPD_SUBJECT_TYPES } from './lgpd.service';

export class ConsentDto {
  @IsIn(LGPD_SUBJECT_TYPES as unknown as string[]) subjectType: string;
  @IsString() subjectId: string;
  @IsIn(CONSENT_PURPOSES as unknown as string[]) purpose: string;
  @IsOptional() @IsBoolean() granted?: boolean;
  @IsOptional() @IsString() source?: string;
}

export class SubjectDto {
  @IsIn(LGPD_SUBJECT_TYPES as unknown as string[]) subjectType: string;
  @IsString() @MinLength(1) subjectId: string;
}

export class EraseDto extends SubjectDto {
  @IsOptional() @IsBoolean() erase?: boolean;
}
