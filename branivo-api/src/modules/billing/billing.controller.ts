import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BillingService } from './billing.service';
import { ManualBillingRunDto } from './dto/manual-billing-run.dto';

@Controller('admin/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('run')
  async runBilling(
    @Body() dto: ManualBillingRunDto,
  ): Promise<{ message: string }> {
    await this.billingService.runManualBilling(dto.tenantId);
    return { message: 'Billing run initiated' };
  }
}
