import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  BreachType,
  BreachSeverity,
  DataCategory,
} from '../entities/data-breach.entity';

const BREACH_TYPES = [
  'unauthorized_access',
  'data_loss',
  'data_exposure',
  'ransomware',
  'accidental_disclosure',
  'insider_threat',
  'other',
] as const;

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

const DATA_CATEGORIES = [
  'name',
  'email',
  'phone',
  'egn',
  'address',
  'payment_data',
  'vehicle_data',
  'policy_data',
  'health_data',
  'other',
] as const;

export class ReportDataBreachDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string | null;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsString()
  description!: string;

  @IsIn(BREACH_TYPES)
  breachType!: BreachType;

  @IsIn(SEVERITIES)
  severity!: BreachSeverity;

  @IsISO8601()
  detectedAt!: string;

  @IsArray()
  @IsString({ each: true })
  @IsIn(DATA_CATEGORIES, { each: true })
  affectedDataCategories!: DataCategory[];

  @IsOptional()
  @IsInt()
  @Min(0)
  affectedSubjectsCount?: number | null;

  @IsOptional()
  @IsString()
  affectedSubjectsDescription?: string | null;

  @IsOptional()
  @IsBoolean()
  kzldNotificationRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  clientNotificationRequired?: boolean;
}
