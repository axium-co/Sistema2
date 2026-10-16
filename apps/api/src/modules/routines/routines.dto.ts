import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ROUTINE_FREQUENCIES, WEEKDAYS, FOCUS_MAX_MINUTES } from '@axium/shared';

const FREQUENCIES = ROUTINE_FREQUENCIES as unknown as string[];

export class RoutineDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsIn(FREQUENCIES) frequency?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(7) weekdays?: (string | number)[];
  @IsOptional() @IsInt() @Min(1) @Max(31) dayOfMonth?: number;
  @IsOptional() @IsString() defaultTime?: string;
  @IsOptional() @IsBoolean() isTemplate?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(50) items?: string[];
}

export class UpdateRoutineDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsIn(FREQUENCIES) frequency?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(7) weekdays?: (string | number)[];
  @IsOptional() @IsInt() @Min(1) @Max(31) dayOfMonth?: number | null;
  @IsOptional() @IsString() defaultTime?: string | null;
  @IsOptional() @IsBoolean() isTemplate?: boolean;
}

export class RoutineItemDto {
  @IsString() @MinLength(1) title: string;
}

export class UpdateRoutineItemDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsInt() position?: number;
}

export class ToggleRunItemDto {
  @IsBoolean() checked: boolean;
}

export class HabitDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsInt() @Min(1) @Max(7) targetPerWeek?: number;
  @IsOptional() @IsString() color?: string;
}

export class UpdateHabitDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(7) targetPerWeek?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsBoolean() archived?: boolean;
}

export class HabitLogDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsInt() @Min(1) value?: number;
}

export class TimeBlockDto {
  @IsString() @MinLength(1) title: string;
  @IsString() date: string;
  @IsInt() @Min(0) @Max(1440) startMin: number;
  @IsInt() @Min(0) @Max(1440) endMin: number;
  @IsOptional() @IsString() cardId?: string | null;
  @IsOptional() @IsString() color?: string;
}

export class UpdateTimeBlockDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1440) startMin?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) endMin?: number;
  @IsOptional() @IsString() cardId?: string | null;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsBoolean() done?: boolean;
}

export class FocusStartDto {
  @IsOptional() @IsString() cardId?: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsInt() @Min(1) @Max(FOCUS_MAX_MINUTES) plannedMinutes?: number;
}

export class FocusStopDto {
  @IsOptional() @IsBoolean() cancel?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(FOCUS_MAX_MINUTES) minutes?: number;
}

export const WEEKDAY_VALUES = WEEKDAYS as unknown as string[];
