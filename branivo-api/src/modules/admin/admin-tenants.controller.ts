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
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminTenantsService } from './admin-tenants.service';
import { InviteTenantDto } from './dto/invite-tenant.dto';
import { VerifyKfnDto } from './dto/verify-kfn.dto';
import { SetupBrokerDto } from './dto/setup-broker.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';

interface AuthenticatedRequest {
  user: { userId: string; role: string };
}

@Controller('admin/tenants')
export class AdminTenantsController {
  constructor(private readonly adminTenantsService: AdminTenantsService) {}

  @Post('invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async inviteTenant(
    @Body() dto: InviteTenantDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminTenantsService.inviteTenant(dto, req.user.userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.adminTenantsService.findAll(Number(page), Number(limit));
  }

  // ─── Public broker-facing onboarding endpoints (auth via onboarding token) ──

  @Get('onboarding/:token')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async getOnboardingStatus(@Param('token') token: string) {
    return this.adminTenantsService.getOnboardingStatus(token);
  }

  @Post('onboarding/:token/stripe-connect')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async brokerInitiateStripeConnect(@Param('token') token: string) {
    const status = await this.adminTenantsService.getOnboardingStatus(token);
    return this.adminTenantsService.initiateStripeConnect(status.tenantId);
  }

  @Post('onboarding/:token/verify-kfn')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async brokerVerifyKfn(
    @Param('token') token: string,
    @Body() dto: VerifyKfnDto,
  ) {
    const status = await this.adminTenantsService.getOnboardingStatus(token);
    return this.adminTenantsService.verifyKfnAndActivate(
      status.tenantId,
      dto.kfn_license,
      null,
    );
  }

  @Post('onboarding/:token/setup')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async setupBrokerUser(
    @Param('token') token: string,
    @Body() dto: SetupBrokerDto,
  ) {
    const status = await this.adminTenantsService.getOnboardingStatus(token);
    return this.adminTenantsService.createBrokerAdminUser(status.tenantId, dto);
  }

  // ─── Super Admin management endpoints ───────────────────────────────────────

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async findOne(@Param('id') id: string) {
    return this.adminTenantsService.findOne(id);
  }

  @Post(':id/stripe-connect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async initiateStripeConnect(@Param('id') id: string) {
    return this.adminTenantsService.initiateStripeConnect(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateTenantStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantStatusDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminTenantsService.updateTenantStatus(
      id,
      dto.status,
      req.user.userId,
    );
  }

  @Post(':id/verify-kfn')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyKfn(
    @Param('id') id: string,
    @Body() dto: VerifyKfnDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminTenantsService.verifyKfnAndActivate(
      id,
      dto.kfn_license,
      req.user.userId,
    );
  }
}
