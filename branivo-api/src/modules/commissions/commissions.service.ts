import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CommissionsRepository } from './commissions.repository';
import { CommissionMatrixEntryDto } from './dto/commission-matrix-response.dto';
import { UpsertCommissionRateDto } from './dto/upsert-commission-rate.dto';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';

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
}
