import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminNotificationService } from './admin-notification.service';
import { CreateSystemNotificationDto } from './dto/create-system-notification.dto';
import { SystemNotificationResponseDto } from './dto/system-notification-response.dto';

interface AuthenticatedRequest {
  user: { userId: string; role: string; tenantId: string };
}

@Controller('admin/notifications')
export class AdminNotificationController {
  constructor(
    private readonly adminNotificationService: AdminNotificationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async broadcast(
    @Body() dto: CreateSystemNotificationDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<SystemNotificationResponseDto> {
    return this.adminNotificationService.broadcast(dto, req.user.userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async listAll(): Promise<SystemNotificationResponseDto[]> {
    return this.adminNotificationService.listAll();
  }

  // CRITICAL: 'active' route must come before ':id' routes to avoid NestJS matching 'active' as UUID
  @Get('active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('broker_admin')
  async getActive(
    @Request() req: AuthenticatedRequest,
  ): Promise<SystemNotificationResponseDto[]> {
    return this.adminNotificationService.getActiveForTenant(req.user.tenantId);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.adminNotificationService.deactivate(id);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('broker_admin')
  async dismiss(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.adminNotificationService.dismiss(id, req.user.tenantId);
  }
}
