import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { NotificationsService } from './notifications.service';
import { UpsertRenewalConfigDto } from './dto/upsert-renewal-config.dto';
import { RenewalConfigResponseDto } from './dto/renewal-config-response.dto';

interface AuthenticatedRequest {
  user: { userId: string; role: string };
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('config/:tenantId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async getRenewalConfig(
    @Param('tenantId') tenantId: string,
  ): Promise<RenewalConfigResponseDto> {
    return this.notificationsService.getTenantRenewalConfig(tenantId);
  }

  @Put('config/:tenantId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async upsertRenewalConfig(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpsertRenewalConfigDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<RenewalConfigResponseDto> {
    return this.notificationsService.upsertTenantRenewalConfig(
      tenantId,
      dto,
      req.user.userId,
    );
  }
}
