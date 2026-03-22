export class InsurerApiStatusResponseDto {
  insurerId!: string;
  insurerName!: string;
  insurerCode!: string;
  circuitState!: 'open' | 'half-open' | 'closed';
  errorRate5min!: number; // процент 0-100, 2 decimal
  avgLatencyMs!: number; // закръглено целочислено
  totalCalls5min!: number;
  isManuallyDisabled!: boolean;
  disabledReason!: string | null;
}
