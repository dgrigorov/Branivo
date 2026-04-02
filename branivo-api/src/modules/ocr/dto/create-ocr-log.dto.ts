import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsArray,
  Min,
  Max,
} from 'class-validator';

/**
 * DTO for POST /api/v1/ocr/log (fire-and-forget analytics logging).
 *
 * SECURITY: `raw_text` is intentionally ABSENT from this DTO.
 * ValidationPipe with whitelist:true + forbidNonWhitelisted:true ensures
 * any `raw_text` field sent by clients is rejected with 400 Bad Request.
 */
export class CreateOcrLogDto {
  // Quality metrics
  @IsOptional()
  @IsNumber()
  blur_variance?: number;

  @IsOptional()
  @IsNumber()
  brightness_avg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  frame_fill_pct?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  photo_count?: number;

  // ML Kit scores
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  mlkit_confidence?: number;

  @IsOptional()
  @IsObject()
  mlkit_field_confidences?: Record<string, number>;

  // Vision fallback
  @IsOptional()
  @IsBoolean()
  vision_used?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  vision_confidence?: number;

  @IsOptional()
  @IsObject()
  vision_field_confidences?: Record<string, number>;

  // Scoring breakdown
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  score_cc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  score_kw?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  score_make?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  score_model?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  score_year?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  final_score?: number;

  @IsOptional()
  @IsIn(['auto', 'top3', 'manual'])
  score_bucket?: 'auto' | 'top3' | 'manual';

  // Enrichment results
  @IsOptional()
  @IsBoolean()
  vin_found?: boolean;

  @IsOptional()
  @IsBoolean()
  kat_hit?: boolean;

  @IsOptional()
  @IsBoolean()
  gf_hit?: boolean;

  @IsOptional()
  @IsBoolean()
  gf_policy_found?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  enrichment_duration_ms?: number;

  // Outcome
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  user_corrected_fields?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  user_selected_rank?: number;

  @IsOptional()
  @IsString()
  final_vehicle_id?: string;

  @IsOptional()
  @IsBoolean()
  quote_initiated?: boolean;
}
