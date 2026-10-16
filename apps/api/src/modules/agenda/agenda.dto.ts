import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { EVENT_TYPES } from '@axium/shared';
import type { EventType } from '@axium/shared';

class AttendeeDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() contactId?: string;
}

export class EventDto {
  @IsString() @MinLength(1) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(EVENT_TYPES as unknown as string[]) type?: EventType;
  @IsOptional() @IsString() color?: string;
  @IsString() startsAt: string;
  @IsString() endsAt: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() videoLink?: string;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsString() calendarId?: string;
  @IsOptional() @IsString() recurrenceRule?: string;
  @IsOptional() @IsInt() reminderMinutes?: number;
  @IsOptional() @IsArray() attendees?: AttendeeDto[];
}

export class UpdateEventDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(EVENT_TYPES as unknown as string[]) type?: EventType;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() videoLink?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsInt() reminderMinutes?: number;
}
