import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  companyName: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  notificationPrefs?: Record<string, boolean>;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class TwoFactorVerifyDto {
  @IsString()
  challengeToken: string;

  @IsString()
  code: string;
}

export class TwoFactorCodeDto {
  @IsString()
  code: string;
}

export class TwoFactorDisableDto {
  @IsOptional()
  @IsString()
  code?: string;
}

export class AcceptInvitationDto {
  @IsString()
  token: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsString()
  @MinLength(8)
  password: string;
}
