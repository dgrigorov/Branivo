import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator';
import { FleetService } from './fleet.service';
import { FleetVehicleFilterDto } from './dto/fleet-vehicle-filter.dto';
import { FleetVehicleResponseDto } from './dto/fleet-vehicle-response.dto';
import { PaginationMeta } from './fleet.service';

@ApiTags('fleet')
@Controller('fleet')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureFlagGuard)
@Roles('fleet_admin', 'broker_admin')
@FeatureFlag('fleet')
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

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
}
