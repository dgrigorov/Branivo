import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminInsurerMonitorService } from './admin-insurer-monitor.service';
import { AdminInsurerDetailService } from './admin-insurer-detail.service';
import { DisableInsurerDto } from './dto/disable-insurer.dto';
import { UpdateInsurerConfigDto } from './dto/update-insurer-config.dto';
import { SetApiKeyDto } from './dto/set-api-key.dto';
import { InsurerApiStatusResponseDto } from './dto/insurer-api-status-response.dto';
import { InsurerDetailResponseDto } from './dto/insurer-detail-response.dto';
import { TestConnectionResponseDto } from './dto/test-connection-response.dto';

interface AuthenticatedRequest {
  user: { userId: string; role: string };
}

@Controller('admin/insurers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminInsurerMonitorController {
  constructor(
    private readonly adminInsurerMonitorService: AdminInsurerMonitorService,
    private readonly adminInsurerDetailService: AdminInsurerDetailService,
  ) {}

  @Get('monitor')
  async getInsurerApiDashboard(): Promise<InsurerApiStatusResponseDto[]> {
    return this.adminInsurerMonitorService.getInsurerApiDashboard();
  }

  @Get(':id')
  async getInsurerDetail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InsurerDetailResponseDto> {
    return this.adminInsurerDetailService.getDetail(id);
  }

  @Put(':id/config')
  async updateInsurerConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInsurerConfigDto,
  ): Promise<InsurerDetailResponseDto> {
    return this.adminInsurerDetailService.updateConfig(id, dto);
  }

  @Post(':id/api-key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setApiKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetApiKeyDto,
  ): Promise<void> {
    await this.adminInsurerDetailService.setApiKey(id, dto);
  }

  @Post(':id/test')
  async testConnection(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TestConnectionResponseDto> {
    return this.adminInsurerDetailService.testConnection(id);
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
