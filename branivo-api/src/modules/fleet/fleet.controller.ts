import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator';
import { FleetService } from './fleet.service';
import { FleetBulkService } from './fleet-bulk.service';
import { FleetVehicleFilterDto } from './dto/fleet-vehicle-filter.dto';
import { FleetVehicleResponseDto } from './dto/fleet-vehicle-response.dto';
import { PaginationMeta } from './fleet.service';
import { BulkQuoteRequestDto } from './dto/bulk-quote-request.dto';
import { BulkQuoteResponseDto } from './dto/bulk-quote-response.dto';
import { BulkPurchaseRequestDto } from './dto/bulk-purchase-request.dto';
import { BulkPurchaseResponseDto } from './dto/bulk-purchase-response.dto';

@ApiTags('fleet')
@Controller('fleet')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureFlagGuard)
@Roles('fleet_admin', 'broker_admin')
@FeatureFlag('fleet')
export class FleetController {
  constructor(
    private readonly fleetService: FleetService,
    private readonly fleetBulkService: FleetBulkService,
  ) {}

  @Get('vehicles')
  @ApiOperation({ summary: 'Get fleet vehicles with insurance status' })
  @ApiResponse({
    status: 200,
    description:
      'Paginated list of fleet vehicles with computed insurance status',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden (insufficient role)' })
  @ApiResponse({
    status: 404,
    description: 'Fleet feature not enabled for tenant',
  })
  async getFleetVehicles(
    @Query() filter: FleetVehicleFilterDto,
  ): Promise<{ data: FleetVehicleResponseDto[]; meta: PaginationMeta }> {
    return this.fleetService.getFleetVehicles(filter);
  }

  @Post('bulk-quotes')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get quotes for multiple fleet vehicles in parallel',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk quote results grouped per vehicle',
  })
  @ApiResponse({ status: 400, description: 'Invalid vehicle IDs' })
  @ApiResponse({
    status: 404,
    description: 'Fleet feature not enabled for tenant',
  })
  async bulkGetQuotes(
    @Body() dto: BulkQuoteRequestDto,
  ): Promise<BulkQuoteResponseDto> {
    return this.fleetBulkService.bulkGetQuotes(dto.vehicleIds);
  }

  @Post('bulk-purchase')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Purchase policies for multiple fleet vehicles' })
  @ApiResponse({
    status: 200,
    description:
      'Partial or full success — always 200, check summary for breakdown',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({
    status: 404,
    description: 'Fleet feature not enabled for tenant',
  })
  async bulkPurchase(
    @Body() dto: BulkPurchaseRequestDto,
  ): Promise<BulkPurchaseResponseDto> {
    return this.fleetBulkService.bulkPurchase(dto.items);
  }
}
