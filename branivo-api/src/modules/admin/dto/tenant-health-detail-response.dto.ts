export interface PendingDowngradeInfo {
  newPlan: string;
  enforceAt: string;
}

export class TenantHealthDetailResponseDto {
  tenantId!: string;
  tenantName!: string;
  activeUsersCount!: number;
  totalRevenueBgn!: number;
  vehicleCount!: number;
  lastPolicyCreatedAt!: string | null;
  lastPolicyInsurer!: string | null;
  activeFeatureFlags!: string[];
  currentPlan!: string;
  pendingDowngrade!: PendingDowngradeInfo | null;
}
