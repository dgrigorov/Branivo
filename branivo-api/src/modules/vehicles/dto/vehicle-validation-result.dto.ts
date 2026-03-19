export class VehicleValidationResultDto {
  canProceedToQuote!: boolean;
  katStatus!: 'ok' | 'manual_fallback' | 'failed' | 'unavailable';
  gfStatus!: 'clean' | 'flagged' | 'unavailable';
  vinValid!: boolean;
  validatedAt!: string;
}
