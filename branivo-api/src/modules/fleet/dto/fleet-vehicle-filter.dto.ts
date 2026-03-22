import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class FleetVehicleFilterDto {
  @IsOptional()
  @IsEnum(['green', 'yellow', 'red'])
  status?: 'green' | 'yellow' | 'red';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
