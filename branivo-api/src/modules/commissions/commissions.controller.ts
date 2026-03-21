import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../clients/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { CommissionsService } from './commissions.service';
import { UpsertCommissionRateDto } from './dto/upsert-commission-rate.dto';
import { ProductType } from './enums/product-type.enum';
import { CommissionDashboardQueryDto } from './dto/commission-dashboard.dto';
import type { CommissionDashboardResponseDto } from './dto/commission-dashboard.dto';

@Controller('admin/commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  async listMatrix() {
    const data = await this.commissionsService.listMatrix();
    return { data };
  }

  @Put(':insurerId/:productType')
  async upsertRate(
    @Param('insurerId', ParseUUIDPipe) insurerId: string,
    @Param('productType', new ParseEnumPipe(ProductType))
    productType: ProductType,
    @Body() dto: UpsertCommissionRateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const effectiveDto: UpsertCommissionRateDto = {
      productType,
      ratePct: dto.ratePct,
    };
    const data = await this.commissionsService.upsertRate(
      insurerId,
      effectiveDto,
      user.userId,
    );
    return { data };
  }
}

@Controller('commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BrokerCommissionsController {
  constructor(
    private readonly commissionsService: CommissionsService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Roles('broker_admin', 'broker_agent', 'broker_viewer')
  async getDashboard(
    @Query() query: CommissionDashboardQueryDto,
  ): Promise<{ data: CommissionDashboardResponseDto }> {
    const tenantId = this.tenantContext.getTenantId();
    const data = await this.commissionsService.getDashboardStats(
      tenantId,
      query,
    );
    return { data };
  }
}
