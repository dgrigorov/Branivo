import type { StageConfigDto } from './upsert-renewal-config.dto';

export class RenewalConfigResponseDto {
  tenantId!: string;
  stages!: StageConfigDto[];
  isDefault!: boolean;
}
