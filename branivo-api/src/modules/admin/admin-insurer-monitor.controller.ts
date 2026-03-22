import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminInsurerMonitorService } from './admin-insurer-monitor.service';
import { DisableInsurerDto } from './dto/disable-insurer.dto';
import { InsurerApiStatusResponseDto } from './dto/insurer-api-status-response.dto';

interface AuthenticatedRequest {
  user: { userId: string; role: string };
}

@Controller('admin/insurers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminInsurerMonitorController {
  constructor(
    private readonly adminInsurerMonitorService: AdminInsurerMonitorService,
  ) {}

  @Get('monitor')
  async getInsurerApiDashboard(): Promise<InsurerApiStatusResponseDto[]> {
    return this.adminInsurerMonitorService.getInsurerApiDashboard();
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableInsurer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisableInsurerDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.adminInsurerMonitorService.activateManualFallback(
      id,
      req.user.userId,
      dto.reason,
    );
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async enableInsurer(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.adminInsurerMonitorService.deactivateManualFallback(
      id,
      req.user.userId,
    );
  }
}
