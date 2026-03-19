import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FeatureFlagsService } from './feature-flags.service';
import { UpdateFeatureFlagsDto } from './dto/update-feature-flags.dto';
import { FeatureFlagsResponseDto } from './dto/feature-flags-response.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; role: string; tenantId: string };
}

@ApiTags('tenants')
@Controller('tenants/features')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('broker_admin')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  @ApiOperation({ summary: 'Get current feature flags for the tenant' })
  async getFeatureFlags(): Promise<{ data: FeatureFlagsResponseDto }> {
    const data = await this.featureFlagsService.getFeatureFlags();
    return { data };
  }

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update feature flags for the tenant' })
  async updateFeatureFlags(
    @Body() dto: UpdateFeatureFlagsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.featureFlagsService.updateFeatureFlags(dto, req.user.id);
  }
}
