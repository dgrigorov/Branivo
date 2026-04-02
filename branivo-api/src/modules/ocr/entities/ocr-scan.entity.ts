import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Analytics table for OCR scan events.
 * Immutable — INSERT only, no UPDATE or DELETE.
 * Separate from ocr_jobs (job tracking) — this is for scoring calibration.
 */
@Entity('ocr_scans')
export class OcrScanEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'user_id', nullable: true, type: 'uuid' })
  userId!: string | null;

  // Quality metrics
  @Column({ name: 'blur_variance', nullable: true, type: 'float' })
  blurVariance!: number | null;

  @Column({ name: 'brightness_avg', nullable: true, type: 'float' })
  brightnessAvg!: number | null;

  @Column({ name: 'frame_fill_pct', nullable: true, type: 'float' })
  frameFillPct!: number | null;

  @Column({ name: 'photo_count', type: 'int', default: 1 })
  photoCount!: number;

  // ML Kit scores
  @Column({ name: 'mlkit_confidence', nullable: true, type: 'float' })
  mlkitConfidence!: number | null;

  @Column({ name: 'mlkit_field_confidences', nullable: true, type: 'jsonb' })
  mlkitFieldConfidences!: Record<string, number> | null;

  // Vision fallback
  @Column({ name: 'vision_used', type: 'boolean', default: false })
  visionUsed!: boolean;

  @Column({ name: 'vision_confidence', nullable: true, type: 'float' })
  visionConfidence!: number | null;

  @Column({ name: 'vision_field_confidences', nullable: true, type: 'jsonb' })
  visionFieldConfidences!: Record<string, number> | null;

  // Scoring breakdown
  @Column({ name: 'score_cc', nullable: true, type: 'float' })
  scoreCc!: number | null;

  @Column({ name: 'score_kw', nullable: true, type: 'float' })
  scoreKw!: number | null;

  @Column({ name: 'score_make', nullable: true, type: 'float' })
  scoreMake!: number | null;

  @Column({ name: 'score_model', nullable: true, type: 'float' })
  scoreModel!: number | null;

  @Column({ name: 'score_year', nullable: true, type: 'float' })
  scoreYear!: number | null;

  @Column({ name: 'final_score', nullable: true, type: 'float' })
  finalScore!: number | null;

  @Column({ name: 'score_bucket', nullable: true, type: 'varchar', length: 10 })
  scoreBucket!: 'auto' | 'top3' | 'manual' | null;

  // Enrichment results
  @Column({ name: 'vin_found', type: 'boolean', default: false })
  vinFound!: boolean;

  @Column({ name: 'kat_hit', nullable: true, type: 'boolean' })
  katHit!: boolean | null;

  @Column({ name: 'gf_hit', nullable: true, type: 'boolean' })
  gfHit!: boolean | null;

  @Column({ name: 'gf_policy_found', nullable: true, type: 'boolean' })
  gfPolicyFound!: boolean | null;

  @Column({ name: 'enrichment_duration_ms', nullable: true, type: 'int' })
  enrichmentDurationMs!: number | null;

  // Outcome tracking
  @Column({ name: 'user_corrected_fields', nullable: true, type: 'jsonb' })
  userCorrectedFields!: string[] | null;

  @Column({ name: 'user_selected_rank', nullable: true, type: 'int' })
  userSelectedRank!: number | null;

  @Column({ name: 'final_vehicle_id', nullable: true, type: 'uuid' })
  finalVehicleId!: string | null;

  @Column({ name: 'quote_initiated', type: 'boolean', default: false })
  quoteInitiated!: boolean;

  // Immutable — no updatedAt
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
