import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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
