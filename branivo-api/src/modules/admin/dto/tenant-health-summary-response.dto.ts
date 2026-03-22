export class TenantHealthSummaryResponseDto {
  tenantId!: string;
  tenantName!: string;
  slug!: string;
  status!: string;
  subscriptionTier!: string | null;
  policiesLast30Days!: number;
  lastActivityAt!: string | null;
  inactiveDays!: number | null;
}
