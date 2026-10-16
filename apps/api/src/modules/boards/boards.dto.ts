import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { CARD_PRIORITIES } from '@axium/shared';
import type { CardPriority } from '@axium/shared';

export class BoardDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsIn(['PRIVATE', 'TEAM', 'TENANT']) visibility?: string;
  @IsOptional() @IsString() teamId?: string;
}

export class ListDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsInt() wipLimit?: number;
}

export class CardDto {
  @IsString() @MinLength(1) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(CARD_PRIORITIES as unknown as string[]) priority?: CardPriority;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsInt() estimateMin?: number;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsArray() assigneeIds?: string[];
}

export class UpdateCardDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(CARD_PRIORITIES as unknown as string[]) priority?: CardPriority;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsInt() estimateMin?: number;
  @IsOptional() @IsInt() spentMin?: number;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsBoolean() completed?: boolean;
}

export class MoveCardDto {
  @IsString() listId: string;
  @IsOptional() position?: number;
}

export class LabelDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() color?: string;
}

export class ChecklistDto {
  @IsString() @MinLength(1) title: string;
}

export class ChecklistItemDto {
  @IsString() @MinLength(1) title: string;
}

export class UpdateChecklistItemDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsBoolean() checked?: boolean;
}

export class CommentDto {
  @IsString() @MinLength(1) body: string;
  @IsOptional() @IsArray() mentions?: string[];
}
