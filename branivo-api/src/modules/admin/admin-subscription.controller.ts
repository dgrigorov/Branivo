import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminSubscriptionService } from './admin-subscription.service';
import { ChangeTierDto } from './dto/change-tier.dto';
import { TierChangePreviewResponseDto } from './dto/tier-change-preview-response.dto';

interface AuthenticatedRequest {
  user: { userId: string; role: string };
}

@Controller('admin/tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminSubscriptionController {
  constructor(
    private readonly adminSubscriptionService: AdminSubscriptionService,
  ) {}

  @Get(':id/subscription/preview')
  async previewTierChange(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('newPlan') newPlan: string,
  ): Promise<TierChangePreviewResponseDto> {
    return this.adminSubscriptionService.previewTierChange(id, newPlan);
  }

  @Post(':id/subscription/tier')
  @HttpCode(HttpStatus.OK)
  async changeTier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTierDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<TierChangePreviewResponseDto> {
    return this.adminSubscriptionService.changeTier(
      id,
      dto.newPlan,
      req.user.userId,
    );
  }
}
