import { IsOptional, IsUUID } from 'class-validator';

export class ManualBillingRunDto {
  @IsOptional()
  @IsUUID('all')
  tenantId?: string;
}
