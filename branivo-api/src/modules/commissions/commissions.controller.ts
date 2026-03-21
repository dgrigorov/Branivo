import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../clients/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CommissionsService } from './commissions.service';
import { UpsertCommissionRateDto } from './dto/upsert-commission-rate.dto';
import { ProductType } from './enums/product-type.enum';

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
