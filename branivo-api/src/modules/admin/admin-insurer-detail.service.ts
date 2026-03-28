import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AdminInsurerMonitorRepository } from './repositories/admin-insurer-monitor.repository';
import { CircuitBreakerService } from '../quotes/circuit-breaker.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import type { UpdateInsurerConfigDto } from './dto/update-insurer-config.dto';
import type { SetApiKeyDto } from './dto/set-api-key.dto';
import {
  InsurerDetailResponseDto,
  InsurerFscDataDto,
} from './dto/insurer-detail-response.dto';
import { TestConnectionResponseDto } from './dto/test-connection-response.dto';

@Injectable()
export class AdminInsurerDetailService {
  private readonly logger = new Logger(AdminInsurerDetailService.name);

  constructor(
    private readonly repo: AdminInsurerMonitorRepository,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly cryptoService: CryptoService,
  ) {}

  async getDetail(insurerId: string): Promise<InsurerDetailResponseDto> {
    const row = await this.repo.findInsurerDetailById(insurerId);
    if (!row) throw new NotFoundException(`Insurer ${insurerId} not found`);

    const metrics = this.circuitBreakerService
      .getInsurerMetrics()
      .get(row.code) ?? {
      errorRate: 0,
      avgLatencyMs: 0,
      totalCalls: 0,
    };
    const circuitState = this.circuitBreakerService.getAggregatedCircuitState(
      row.code,
    );

    const dto = new InsurerDetailResponseDto();
    dto.insurerId = row.id;
    dto.name = row.name;
    dto.code = row.code;
    dto.isActive = row.isActive;
    dto.isManuallyDisabled = row.isManuallyDisabled;
    dto.disabledReason = row.disabledReason;
    dto.rating = Number(row.rating);
    dto.claimSpeed = Number(row.claimSpeed);
    dto.extrasConfig = row.extrasConfig;
    dto.adapterClass = row.adapterClass;
    dto.apiEndpoint = row.apiEndpoint;
    dto.fscInsurerId = row.fscInsurerId;
    dto.logoUrl = row.logoUrl;
    dto.description = row.description;
    dto.circuitState = circuitState;
    dto.errorRate5min = Math.round(metrics.errorRate * 100) / 100;
    dto.avgLatencyMs = Math.round(metrics.avgLatencyMs);
    dto.totalCalls5min = metrics.totalCalls;
    dto.createdAt = row.createdAt;
    dto.updatedAt = row.updatedAt;

    if (row.fscInsurerId) {
      const fsc = new InsurerFscDataDto();
      fsc.trustpilotScore = row.fscTrustpilotScore
        ? Number(row.fscTrustpilotScore)
        : null;
      fsc.trustpilotReviewsCount = row.fscTrustpilotReviewsCount;
      fsc.trustpilotUrl = row.fscTrustpilotUrl;
      fsc.website = row.fscWebsite;
      fsc.officeAddress = row.fscOfficeAddress;
      fsc.contactPhone = row.fscContactPhone;
      fsc.contactEmails = row.fscContactEmails ?? [];
      fsc.socialLinks = row.fscSocialLinks ?? [];
      fsc.logoUrl = row.fscLogoUrl;
      fsc.longDescription = row.fscLongDescription;
      dto.fsc = fsc;
    } else {
      dto.fsc = null;
    }

    return dto;
  }

  async updateConfig(
    insurerId: string,
    dto: UpdateInsurerConfigDto,
  ): Promise<InsurerDetailResponseDto> {
    const existing = await this.repo.findInsurerDetailById(insurerId);
    if (!existing)
      throw new NotFoundException(`Insurer ${insurerId} not found`);

    await this.repo.updateInsurerConfig(insurerId, {
      name: dto.name,
      adapterClass: dto.adapterClass,
      apiEndpoint: dto.apiEndpoint,
      fscInsurerId: dto.fscInsurerId,
      logoUrl: dto.logoUrl,
      description: dto.description,
      rating: dto.rating,
      claimSpeed: dto.claimSpeed,
    });

    return this.getDetail(insurerId);
  }

  async setApiKey(insurerId: string, dto: SetApiKeyDto): Promise<void> {
    const existing = await this.repo.findInsurerDetailById(insurerId);
    if (!existing)
      throw new NotFoundException(`Insurer ${insurerId} not found`);

    const encrypted = this.cryptoService.encrypt(dto.apiKey);
    await this.repo.setApiKey(insurerId, encrypted);

    this.logger.log(
      `API key updated for insurer "${existing.name}" (${existing.code})`,
    );
  }

  async testConnection(insurerId: string): Promise<TestConnectionResponseDto> {
    const existing = await this.repo.findInsurerDetailById(insurerId);
    if (!existing)
      throw new NotFoundException(`Insurer ${insurerId} not found`);

    const apiEndpoint = existing.apiEndpoint;
    if (!apiEndpoint) {
      throw new BadRequestException(
        'No API endpoint configured for this insurer',
      );
    }

    // SSRF guard: only allow http/https to public hosts
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(apiEndpoint);
    } catch {
      throw new BadRequestException('Invalid API endpoint URL');
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new BadRequestException('API endpoint must use http or https');
    }
    const hostname = parsedUrl.hostname.toLowerCase();
    const isPrivate =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('192.168.') ||
      hostname === '::1';
    if (isPrivate) {
      throw new BadRequestException(
        'API endpoint must point to a publicly routable host',
      );
    }

    const start = Date.now();
    const dto = new TestConnectionResponseDto();

    try {
      const timeoutMs = 5000;
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      const response = await fetch(apiEndpoint, {
        method: 'HEAD',
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timer);
      });

      dto.latencyMs = Date.now() - start;
      dto.success = response.status < 500;
      dto.message = dto.success
        ? `Reached endpoint (HTTP ${response.status})`
        : `Endpoint returned HTTP ${response.status}`;
    } catch (err) {
      dto.latencyMs = Date.now() - start;
      dto.success = false;
      const message = err instanceof Error ? err.message : 'Unknown error';
      dto.message = `Connection failed: ${message}`;
      this.logger.warn(
        `Test connection failed for insurer ${insurerId}: ${message}`,
      );
    }

    return dto;
  }
}
