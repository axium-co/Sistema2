import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class PresignDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(1) mimeType: string;
  @IsOptional() @IsString() folderId?: string;
}

export class CreateFolderDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() parentId?: string;
}

export class UploadDto {
  @IsOptional() @IsString() folderId?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
}

export class InitChunkedUploadDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(1) mimeType: string;
  @IsNumber() size: number;
  @IsOptional() @IsString() folderId?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
}

export class LinkFileDto {
  @IsString() @MinLength(1) entityType: string;
  @IsString() @MinLength(1) entityId: string;
}
