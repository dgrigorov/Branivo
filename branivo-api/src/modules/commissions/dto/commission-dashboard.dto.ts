import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CommissionDashboardQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  insurerId?: string;
}

export interface CommissionPolicyItemDto {
  id: string;
  insurerId: string;
  insurerName: string;
  productType: string;
  premiumAmount: number;
  commissionPct: number;
  commissionAmount: number;
  commissionStatus: 'confirmed' | 'pending';
  createdAt: string;
}

export interface CommissionByInsurerDto {
  insurerId: string;
  insurerName: string;
  policiesCount: number;
  totalPremium: number;
  totalCommission: number;
}

export interface CommissionDashboardResponseDto {
  summary: {
    totalPolicies: number;
    totalPremium: number;
    totalCommission: number;
    currency: string;
  };
  byInsurer: CommissionByInsurerDto[];
  policies: CommissionPolicyItemDto[];
}
