import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OcrAnalyticsFiltersDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsIn([7, 30])
  @Type(() => Number)
  days?: 7 | 30;
}

export class OcrFieldStat {
  fieldName!: string;
  avgConfidence!: number;
  fallbackRate!: number;
  totalJobs!: number;
}

export class OcrAnalyticsResponseDto {
  stats!: OcrFieldStat[];
  tenantId?: string;
  days!: number;
  generatedAt!: string;
}

export class OcrTrendPoint {
  date!: string;
  avgConfidence!: number;
  fallbackRate!: number;
  totalJobs!: number;
}

export class OcrTrendFiltersDto {
  @IsNotEmpty()
  @IsString()
  field!: string;

  @IsOptional()
  @IsIn([7, 30])
  @Type(() => Number)
  days?: 7 | 30;

  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class OcrSessionFiltersDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsIn([7, 30])
  @Type(() => Number)
  days?: 7 | 30;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsIn([10, 25, 50])
  @Type(() => Number)
  limit?: number;
}

export interface OcrFieldDto {
  value: string | null;
  confidence: number;
  autoFilled: boolean;
}

export interface OcrFieldResultDto {
  license_plate?: OcrFieldDto;
  vin?: OcrFieldDto;
  cert_number?: OcrFieldDto;
  make?: OcrFieldDto;
  model?: OcrFieldDto;
  year?: OcrFieldDto;
  color?: OcrFieldDto;
  engine_volume?: OcrFieldDto;
  fuel_type?: OcrFieldDto;
  first_registration_date?: OcrFieldDto;
  owner_name?: OcrFieldDto;
  owner_egn?: OcrFieldDto;
  owner_address?: OcrFieldDto;
}

export class OcrSessionDto {
  id!: string;
  sessionToken!: string;
  tenantId!: string;
  provider!: string | null;
  status!: string;
  imagesCount!: number;
  result!: OcrFieldResultDto | null;
  confidenceScores!: Record<string, number> | null;
  createdAt!: string;
}

export class OcrSessionsResponseDto {
  sessions!: OcrSessionDto[];
  total!: number;
  page!: number;
  limit!: number;
}
