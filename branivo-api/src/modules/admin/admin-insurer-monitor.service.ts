import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminInsurerMonitorRepository } from './repositories/admin-insurer-monitor.repository';
import { CircuitBreakerService } from '../quotes/circuit-breaker.service';
import { EmailService } from '../../common/email/email.service';
import { InsurerApiStatusResponseDto } from './dto/insurer-api-status-response.dto';

const ERROR_RATE_ALERT_THRESHOLD = 1.0; // процент

@Injectable()
export class AdminInsurerMonitorService {
  private readonly logger = new Logger(AdminInsurerMonitorService.name);

  constructor(
    private readonly adminInsurerMonitorRepository: AdminInsurerMonitorRepository,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async getInsurerApiDashboard(): Promise<InsurerApiStatusResponseDto[]> {
    const insurers = await this.adminInsurerMonitorRepository.findAllInsurers();
    const metricsMap = this.circuitBreakerService.getInsurerMetrics();

    return insurers.map((ins) => {
      const metrics = metricsMap.get(ins.code) ?? {
        errorRate: 0,
        avgLatencyMs: 0,
        totalCalls: 0,
      };
      const circuitState = this.circuitBreakerService.getAggregatedCircuitState(
        ins.code,
      );

      const dto = new InsurerApiStatusResponseDto();
      dto.insurerId = ins.id;
      dto.insurerName = ins.name;
      dto.insurerCode = ins.code;
      dto.circuitState = circuitState;
      dto.errorRate5min = Math.round(metrics.errorRate * 100) / 100;
      dto.avgLatencyMs = Math.round(metrics.avgLatencyMs);
      dto.totalCalls5min = metrics.totalCalls;
      dto.isManuallyDisabled = ins.isManuallyDisabled;
      dto.disabledReason = ins.disabledReason;
      return dto;
    });
  }

  async activateManualFallback(
    insurerId: string,
    adminId: string,
    reason: string,
  ): Promise<void> {
    const insurer =
      await this.adminInsurerMonitorRepository.findInsurerById(insurerId);
    if (!insurer) {
      throw new NotFoundException(`Insurer ${insurerId} not found`);
    }

    await this.adminInsurerMonitorRepository.disableInsurer(
      insurerId,
      adminId,
      reason,
    );
    this.circuitBreakerService.resetBreakersForInsurer(insurer.code);

    this.logger.warn(
      `Manual fallback ACTIVATED for insurer "${insurer.name}" (${insurer.code}) by admin ${adminId}. Reason: ${reason}`,
    );
  }

  async deactivateManualFallback(
    insurerId: string,
    adminId: string,
  ): Promise<void> {
    const insurer =
      await this.adminInsurerMonitorRepository.findInsurerById(insurerId);
    if (!insurer) {
      throw new NotFoundException(`Insurer ${insurerId} not found`);
    }

    await this.adminInsurerMonitorRepository.enableInsurer(insurerId, adminId);
    this.circuitBreakerService.resetBreakersForInsurer(insurer.code);

    this.logger.log(
      `Manual fallback DEACTIVATED for insurer "${insurer.name}" (${insurer.code}) by admin ${adminId}`,
    );
  }

  async runErrorRateCheck(): Promise<void> {
    const dashboard = await this.getInsurerApiDashboard();
    const adminEmail = this.config.get<string>(
      'SUPER_ADMIN_EMAIL',
      'admin@branivo.bg',
    );

    this.logger.log(
      `Error rate check: scanning ${dashboard.length} insurer(s)`,
    );

    for (const ins of dashboard) {
      if (ins.isManuallyDisabled) continue; // вече деактивиран — пропусни
      if (ins.errorRate5min > ERROR_RATE_ALERT_THRESHOLD) {
        this.logger.warn(
          `High error rate for insurer "${ins.insurerName}": ${ins.errorRate5min.toFixed(2)}%`,
        );
        try {
          await this.emailService.sendInsurerAlertEmail(
            adminEmail,
            ins.insurerName,
            ins.errorRate5min,
            ins.avgLatencyMs,
          );
        } catch (err) {
          this.logger.error(
            `Failed to send alert email for insurer "${ins.insurerName}"`,
            err,
          );
        }
      }
    }
  }
}
