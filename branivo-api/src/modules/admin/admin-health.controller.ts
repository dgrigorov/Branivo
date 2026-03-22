import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminHealthService } from './admin-health.service';
import { TenantHealthSummaryResponseDto } from './dto/tenant-health-summary-response.dto';
import { TenantHealthDetailResponseDto } from './dto/tenant-health-detail-response.dto';

@Controller('admin/health')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminHealthController {
  constructor(private readonly adminHealthService: AdminHealthService) {}

  @Get()
  async getPlatformHealth(): Promise<TenantHealthSummaryResponseDto[]> {
    return this.adminHealthService.getPlatformHealthDashboard();
  }

  @Get(':tenantId')
  async getTenantDetail(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
  ): Promise<TenantHealthDetailResponseDto> {
    return this.adminHealthService.getTenantHealthDetail(tenantId);
  }
}
