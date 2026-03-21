import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CommissionsRepository } from './commissions.repository';
import type { CreatePendingEventData } from './commissions.repository';
import { CommissionMatrixEntryDto } from './dto/commission-matrix-response.dto';
import { UpsertCommissionRateDto } from './dto/upsert-commission-rate.dto';
import type {
  CommissionByInsurerDto,
  CommissionDashboardQueryDto,
  CommissionDashboardResponseDto,
  CommissionPolicyItemDto,
} from './dto/commission-dashboard.dto';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(
    private readonly commissionsRepo: CommissionsRepository,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async getRate(insurerId: string, productType: string): Promise<number> {
    const entry = await this.commissionsRepo.findByInsurerAndProduct(
      insurerId,
      productType,
    );
    if (entry) {
      return Number(entry.ratePct);
    }
    const defaultRate = parseFloat(
      this.config.get<string>('PLATFORM_FEE_PCT') ?? '0.05',
    );
    this.logger.debug(
      `No commission_matrix entry for insurer=${insurerId} product=${productType}; using default ${defaultRate}`,
    );
    return defaultRate;
  }

  async listMatrix(): Promise<CommissionMatrixEntryDto[]> {
    const entries = await this.commissionsRepo.findAll();
    return entries.map((e) => ({
      insurerId: e.insurerId,
      insurerName: e.insurer?.name ?? '',
      productType: e.productType,
      ratePct: Number(e.ratePct),
      updatedAt: e.updatedAt.toISOString(),
    }));
  }

  async upsertRate(
    insurerId: string,
    dto: UpsertCommissionRateDto,
    userId: string | null,
  ): Promise<CommissionMatrixEntryDto> {
    const existing = await this.commissionsRepo.findByInsurerAndProduct(
      insurerId,
      dto.productType,
    );
    const oldRate = existing ? Number(existing.ratePct) : null;

    const entry = await this.commissionsRepo.upsert({
      insurerId,
      productType: dto.productType,
      ratePct: dto.ratePct,
      createdBy: userId,
    });

    try {
      await this.dataSource.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          SYSTEM_TENANT_ID,
          userId,
          'commission_matrix.updated',
          'commission_matrix',
          entry.id,
          JSON.stringify({
            insurer_id: insurerId,
            product_type: dto.productType,
            old_rate: oldRate,
            new_rate: dto.ratePct,
          }),
        ],
      );
    } catch (auditErr) {
      this.logger.error(
        `audit_log write failed for commission_matrix entry=${entry.id}`,
        auditErr instanceof Error ? auditErr.stack : String(auditErr),
      );
    }

    return {
      insurerId: entry.insurerId,
      insurerName: entry.insurer?.name ?? '',
      productType: entry.productType,
      ratePct: Number(entry.ratePct),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  async createPendingEvent(data: CreatePendingEventData): Promise<void> {
    await this.commissionsRepo.createPendingEvent(data);
  }

  async confirmPendingEvent(
    paymentId: string,
    tenantId: string,
  ): Promise<void> {
    await this.commissionsRepo.confirmPendingEvent(paymentId, tenantId);
  }

  async failPendingEvent(paymentId: string, tenantId: string): Promise<void> {
    await this.commissionsRepo.failPendingEvent(paymentId, tenantId);
  }

  async getDashboardStats(
    tenantId: string,
    query: CommissionDashboardQueryDto,
  ): Promise<CommissionDashboardResponseDto> {
    const dateFrom =
      query.dateFrom ??
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const rows = await this.commissionsRepo.getDashboardData(tenantId, {
      dateFrom,
      dateTo: query.dateTo,
      insurerId: query.insurerId,
    });

    const byInsurerMap = new Map<string, CommissionByInsurerDto>();
    const policies: CommissionPolicyItemDto[] = [];

    for (const row of rows) {
      const premiumAmount = Number(row.premium_amount);
      const commissionPct = Number(row.commission_pct);
      const commissionAmount = Number(row.commission_amount);

      policies.push({
        id: row.id,
        insurerId: row.insurer_id,
        insurerName: row.insurer_name,
        productType: row.product_type,
        premiumAmount,
        commissionPct,
        commissionAmount,
        commissionStatus: row.commission_status,
        createdAt: row.created_at.toISOString(),
      });

      const existing = byInsurerMap.get(row.insurer_id);
      if (existing) {
        existing.policiesCount += 1;
        existing.totalPremium = round2(existing.totalPremium + premiumAmount);
        existing.totalCommission = round2(
          existing.totalCommission + commissionAmount,
        );
      } else {
        byInsurerMap.set(row.insurer_id, {
          insurerId: row.insurer_id,
          insurerName: row.insurer_name,
          policiesCount: 1,
          totalPremium: premiumAmount,
          totalCommission: commissionAmount,
        });
      }
    }

    const byInsurer = Array.from(byInsurerMap.values());
    const totalPolicies = policies.length;
    const totalPremium = round2(
      byInsurer.reduce((s, b) => s + b.totalPremium, 0),
    );
    const totalCommission = round2(
      byInsurer.reduce((s, b) => s + b.totalCommission, 0),
    );

    return {
      summary: {
        totalPolicies,
        totalPremium,
        totalCommission,
        currency: 'BGN',
      },
      byInsurer,
      policies,
    };
  }
}
