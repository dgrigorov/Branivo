import {
  IsIn,
  IsNotEmpty,
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

export class CreatePolicyDto {
  @IsUUID()
  ownerId!: string;

  @IsUUID()
  vehicleId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  policyNumber!: string;

  @IsOptional()
  @IsString()
  @IsIn(['pending', 'active', 'failed', 'canceled'])
  status?: 'pending' | 'active' | 'failed' | 'canceled';

  @IsNumber()
  @Min(0)
  premiumAmount!: number;

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
  @IsUUID()
  paymentId?: string;

  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @IsOptional()
  @IsUUID()
  insurerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripePaymentIntentId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
