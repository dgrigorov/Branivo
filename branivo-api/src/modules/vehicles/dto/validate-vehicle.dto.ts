import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class ValidateVehicleDto {
  @IsString()
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/, { message: 'VIN невалиден формат' })
  vin!: string;

  @IsString()
  licensePlate!: string;

  @IsOptional()
  @IsBoolean()
  katManuallyConfirmed?: boolean;
}
