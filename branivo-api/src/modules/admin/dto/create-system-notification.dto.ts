import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateSystemNotificationDto {
  @Transform(({ value }: { value: string }) => value.trim())
  @IsNotEmpty()
  @IsString()
  message!: string;

  @IsIn(['info', 'warning', 'critical'])
  type!: 'info' | 'warning' | 'critical';

  @IsOptional()
  @IsUUID()
  tenantId?: string; // undefined = broadcast 'all'
}
