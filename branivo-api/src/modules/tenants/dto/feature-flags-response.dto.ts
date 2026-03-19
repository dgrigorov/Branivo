export interface FeatureFlagDefinition {
  key: string;
  enabled: boolean;
  planRestricted: boolean;
  requiredPlan: string | null;
}

export class FeatureFlagsResponseDto {
  flags!: FeatureFlagDefinition[];
}
