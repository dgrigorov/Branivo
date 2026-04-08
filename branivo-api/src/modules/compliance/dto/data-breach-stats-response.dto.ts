import { BreachStatus, BreachSeverity } from '../entities/data-breach.entity';

export class DataBreachStatsResponseDto {
  total!: number;
  byStatus!: Record<BreachStatus, number>;
  bySeverity!: Record<BreachSeverity, number>;
  overdueCount!: number;
  approachingDeadlineCount!: number;
  last30Days!: number;
  complianceRate!: number;
}
