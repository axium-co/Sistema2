import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { AuditService } from '../../common/audit.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, TwoFactorService, AuditService],
  exports: [AuthService, AuditService, TwoFactorService],
})
export class AuthModule {}
