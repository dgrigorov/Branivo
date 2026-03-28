export class InsurerDetailResponseDto {
  insurerId!: string;
  name!: string;
  code!: string;
  isActive!: boolean;
  isManuallyDisabled!: boolean;
  disabledReason!: string | null;
  rating!: number;
  claimSpeed!: number;
  extrasConfig!: Record<string, unknown>;
  adapterClass!: string;
  apiEndpoint!: string | null;
  fscInsurerId!: string | null;
  logoUrl!: string | null;
  description!: string | null;
  // FSC enrichment (joined when fscInsurerId is set)
  fsc!: InsurerFscDataDto | null;
  // Live circuit-breaker metrics
  circuitState!: string;
  errorRate5min!: number;
  avgLatencyMs!: number;
  totalCalls5min!: number;
  createdAt!: string;
  updatedAt!: string;
}

export class InsurerFscDataDto {
  trustpilotScore!: number | null;
  trustpilotReviewsCount!: number | null;
  trustpilotUrl!: string | null;
  website!: string | null;
  officeAddress!: string | null;
  contactPhone!: string | null;
  contactEmails!: string[];
  socialLinks!: string[];
  logoUrl!: string | null;
  longDescription!: string | null;
}
