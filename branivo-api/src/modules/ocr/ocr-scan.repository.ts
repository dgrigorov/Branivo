import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { OcrScanEntity } from './entities/ocr-scan.entity';
import { CreateOcrLogDto } from './dto/create-ocr-log.dto';

@Injectable()
export class OcrScanRepository {
  constructor(
    @InjectRepository(OcrScanEntity)
    private readonly repo: Repository<OcrScanEntity>,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * INSERT only — this table is immutable (analytics data).
   * Never use UPDATE or DELETE on ocr_scans.
   */
  async createScan(dto: CreateOcrLogDto): Promise<OcrScanEntity> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Tenant context required to log OCR scan',
      );
    }

    // Deduplicate user_corrected_fields
    const correctedFields = dto.user_corrected_fields
      ? [...new Set(dto.user_corrected_fields)]
      : null;

    const entity = this.repo.create({
      tenantId,
      blurVariance: dto.blur_variance ?? null,
      brightnessAvg: dto.brightness_avg ?? null,
      frameFillPct: dto.frame_fill_pct ?? null,
      photoCount: dto.photo_count ?? 1,
      mlkitConfidence: dto.mlkit_confidence ?? null,
      mlkitFieldConfidences: dto.mlkit_field_confidences ?? null,
      visionUsed: dto.vision_used ?? false,
      visionConfidence: dto.vision_confidence ?? null,
      visionFieldConfidences: dto.vision_field_confidences ?? null,
      scoreCc: dto.score_cc ?? null,
      scoreKw: dto.score_kw ?? null,
      scoreMake: dto.score_make ?? null,
      scoreModel: dto.score_model ?? null,
      scoreYear: dto.score_year ?? null,
      finalScore: dto.final_score ?? null,
      scoreBucket: dto.score_bucket ?? null,
      vinFound: dto.vin_found ?? false,
      katHit: dto.kat_hit ?? null,
      gfHit: dto.gf_hit ?? null,
      gfPolicyFound: dto.gf_policy_found ?? null,
      enrichmentDurationMs: dto.enrichment_duration_ms ?? null,
      userCorrectedFields: correctedFields,
      userSelectedRank: dto.user_selected_rank ?? null,
      finalVehicleId: dto.final_vehicle_id ?? null,
      quoteInitiated: dto.quote_initiated ?? false,
    });

    return this.repo.save(entity);
  }
}
