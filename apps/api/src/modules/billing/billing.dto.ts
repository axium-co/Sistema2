import { IsIn, IsOptional, IsString } from 'class-validator';
import { PLANS } from '@axium/shared';

const PLAN_CODES = PLANS.map((p) => p.code) as unknown as string[];
const BILLING_TYPES = ['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'];

export class CheckoutDto {
  @IsIn(PLAN_CODES) planCode: string;
  @IsOptional() @IsIn(BILLING_TYPES) billingType?: string;
  @IsOptional() @IsString() cpfCnpj?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() email?: string;
}
