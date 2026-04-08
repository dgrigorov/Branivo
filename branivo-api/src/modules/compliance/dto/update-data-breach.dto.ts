import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { BreachStatus } from '../entities/data-breach.entity';

const STATUSES = [
  'detected',
  'investigating',
  'contained',
  'notified_kzld',
  'notified_clients',
  'closed',
] as const;

export class UpdateDataBreachDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: BreachStatus;

  @IsOptional()
  @IsISO8601()
  kzldNotifiedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  kzldNotificationReference?: string;

  @IsOptional()
  @IsString()
  containmentActions?: string;

  @IsOptional()
  @IsString()
  remediationActions?: string;

  @IsOptional()
  @IsBoolean()
  clientNotificationRequired?: boolean;

  @IsOptional()
  @IsISO8601()
  clientNotificationSentAt?: string;

  @IsOptional()
  @IsString()
  lessonsLearned?: string;

  @IsOptional()
  @IsISO8601()
  closedAt?: string;
}
