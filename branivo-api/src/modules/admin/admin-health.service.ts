import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminHealthRepository } from './repositories/admin-health.repository';
import { EmailService } from '../../common/email/email.service';
import { TenantHealthSummaryResponseDto } from './dto/tenant-health-summary-response.dto';
import { TenantHealthDetailResponseDto } from './dto/tenant-health-detail-response.dto';

@Injectable()
export class AdminHealthService {
  private readonly logger = new Logger(AdminHealthService.name);

  constructor(
    private readonly adminHealthRepository: AdminHealthRepository,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async getPlatformHealthDashboard(): Promise<
    TenantHealthSummaryResponseDto[]
  > {
    return this.adminHealthRepository.findAllTenantsHealth();
  }

  async getTenantHealthDetail(
    tenantId: string,
  ): Promise<TenantHealthDetailResponseDto> {
    const detail =
      await this.adminHealthRepository.findTenantHealthDetail(tenantId);
    if (!detail) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }
    return detail;
  }

  async runInactivityCheck(): Promise<void> {
    const inactiveTenants =
      await this.adminHealthRepository.findTenantsWithInactiveDays(7);

    this.logger.log(
      `Inactivity check: found ${inactiveTenants.length} inactive tenant(s)`,
    );

    const adminEmail = this.config.get<string>(
      'SUPER_ADMIN_EMAIL',
      'admin@branivo.bg',
    );

    for (const tenant of inactiveTenants) {
      this.logger.log(
        `Sending inactivity alert for tenant "${tenant.tenantName}" (${tenant.inactiveDays} days inactive)`,
      );
      try {
        await this.emailService.sendInactivityAlert(
          adminEmail,
          tenant.tenantName,
          tenant.inactiveDays,
        );
      } catch (err) {
        this.logger.error(
          `Failed to send inactivity alert for tenant "${tenant.tenantName}"`,
          err,
        );
      }
    }

    // AC4: Basic isolation anomaly check (Story 8.1 scope — log only)
    const orphaned = await this.adminHealthRepository.countOrphanedPolicies();
    if (orphaned > 0) {
      this.logIsolationIncident('system');
    }
  }

  logIsolationIncident(affectedTenantId: string): void {
    this.logger.error(
      JSON.stringify({
        event: 'TENANT_ISOLATION_INCIDENT',
        severity: 'CRITICAL',
        tenantId: affectedTenantId,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
