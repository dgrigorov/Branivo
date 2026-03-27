import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class UpdatePolicyDto {
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  policyNumber?: string;

  @IsOptional()
  @IsString()
  @IsIn(['pending', 'active', 'failed', 'canceled'])
  status?: 'pending' | 'active' | 'failed' | 'canceled';

  @IsOptional()
  @IsNumber()
  @Min(0)
  premiumAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionPct?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX)
  coverageStartDate?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX)
  coverageEndDate?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
