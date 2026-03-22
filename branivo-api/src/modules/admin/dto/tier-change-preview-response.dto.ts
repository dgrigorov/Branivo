export class TierChangePreviewResponseDto {
  oldPlan!: string;
  newPlan!: string;
  isUpgrade!: boolean;
  /** Флагове, които ще бъдат деактивирани (само при downgrade) */
  affectedFlags!: string[];
  /** ISO date — null при upgrade */
  graceEndsAt!: string | null;
}
