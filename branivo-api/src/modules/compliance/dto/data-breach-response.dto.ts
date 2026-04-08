import {
  BreachType,
  BreachSeverity,
  BreachStatus,
  DataCategory,
} from '../entities/data-breach.entity';

export class DataBreachResponseDto {
  id!: string;
  tenantId!: string | null;
  title!: string;
  description!: string;
  breachType!: BreachType;
  severity!: BreachSeverity;
  status!: BreachStatus;
  detectedAt!: Date;
  reportedBy!: string | null;
  affectedDataCategories!: DataCategory[];
  affectedSubjectsCount!: number | null;
  affectedSubjectsDescription!: string | null;
  kzldNotificationRequired!: boolean;
  kzldNotifiedAt!: Date | null;
  kzldNotificationReference!: string | null;
  kzldNotificationDeadline!: Date;
  clientNotificationRequired!: boolean;
  clientNotificationSentAt!: Date | null;
  containmentActions!: string | null;
  remediationActions!: string | null;
  lessonsLearned!: string | null;
  closedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  /** Hours until KZLD deadline; null if already notified */
  hoursUntilDeadline!: number | null;
  isOverdue!: boolean;
}
