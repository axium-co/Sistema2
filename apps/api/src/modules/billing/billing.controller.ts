import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CheckoutDto } from './billing.dto';
import { Public, RequirePermission } from '../../common/auth';

@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Public()
  @Post('webhook')
  webhook(@Body() body: any, @Headers('asaas-access-token') token?: string) {
    return this.service.handleWebhook(body, token);
  }

  @Get('plans')
  @RequirePermission('config', 'view')
  plans() {
    return { mocked: this.service.mocked, plans: this.service.plans() };
  }

  @Get('subscription')
  @RequirePermission('config', 'view')
  subscription() {
    return this.service.getSubscription();
  }

  @Get('invoices')
  @RequirePermission('config', 'view')
  invoices() {
    return this.service.listInvoices();
  }

  @Post('checkout')
  @RequirePermission('config', 'edit')
  checkout(@Body() dto: CheckoutDto) {
    return this.service.checkout(dto);
  }

  @Post('cancel')
  @RequirePermission('config', 'edit')
  cancel() {
    return this.service.cancel();
  }
}
