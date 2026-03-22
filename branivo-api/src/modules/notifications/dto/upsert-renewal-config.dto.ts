import {
  IsArray,
  IsBoolean,
  IsIn,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { RenewalStage } from '../../renewal/renewal.repository';
import type { NotificationChannel } from '../entities/notification-log.entity';

const VALID_STAGES: RenewalStage[] = [
  'd_minus_30',
  'd_minus_7',
  'd_minus_3',
  'd_minus_1',
  'd_plus_1',
];
const VALID_CHANNELS: NotificationChannel[] = [
  'push',
  'sms',
  'email',
  'dashboard',
];

export class StageConfigDto {
  @IsIn(VALID_STAGES)
  stage!: RenewalStage;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(VALID_CHANNELS, { each: true })
  channels!: NotificationChannel[];

  @IsBoolean()
  enabled!: boolean;
}

export class UpsertRenewalConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StageConfigDto)
  stages!: StageConfigDto[];
}
