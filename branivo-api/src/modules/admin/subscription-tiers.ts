/** Plan tier definitions — consistent with FLAG_DEFINITIONS in feature-flags.service.ts */
export const PLAN_TIERS: Record<
  string,
  { monthlyFee: number; allowedFlags: string[] }
> = {
  starter: {
    monthlyFee: 49,
    allowedFlags: ['sticker_delivery', 'dkp', 'renewal_sms', 'renewal_push'],
  },
  professional: {
    monthlyFee: 149,
    allowedFlags: [
      'fleet',
      'kasko',
      'api_access',
      'sticker_delivery',
      'dkp',
      'renewal_sms',
      'renewal_push',
    ],
  },
  enterprise: {
    monthlyFee: 299,
    allowedFlags: [
      'fleet',
      'kasko',
      'api_access',
      'sticker_delivery',
      'dkp',
      'renewal_sms',
      'renewal_push',
    ],
  },
};

/** Изчислява флаговете, които ще бъдат деактивирани при преминаване към newPlan */
export function computeDowngradedFlags(
  currentFeatures: Record<string, boolean>,
  newPlan: string,
): string[] {
  const allowed = new Set(PLAN_TIERS[newPlan]?.allowedFlags ?? []);
  return Object.entries(currentFeatures)
    .filter(([flag, enabled]) => enabled && !allowed.has(flag))
    .map(([flag]) => flag);
}

/** Изчислява новите features след прилагане на plan */
export function buildFeaturesForPlan(
  currentFeatures: Record<string, boolean>,
  newPlan: string,
): Record<string, boolean> {
  const allowed = new Set(PLAN_TIERS[newPlan]?.allowedFlags ?? []);
  const result: Record<string, boolean> = { ...currentFeatures };
  for (const [flag, enabled] of Object.entries(result)) {
    if (enabled && !allowed.has(flag)) {
      result[flag] = false;
    }
  }
  return result;
}
