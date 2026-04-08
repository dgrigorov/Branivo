import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type {
  BreachStatus,
  BreachSeverity,
} from '../entities/data-breach.entity';

const STATUSES = [
  'detected',
  'investigating',
  'contained',
  'notified_kzld',
  'notified_clients',
  'closed',
] as const;

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export class ListDataBreachesDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: BreachStatus;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: BreachSeverity;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
