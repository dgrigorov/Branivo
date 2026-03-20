import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/, { message: 'VIN невалиден формат' })
  @Length(17, 17)
  vin!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  licensePlate!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  make!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  model!: string;

  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  year!: number;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  color?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  engineVolume?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  fuelType?: string;

  @IsOptional()
  @IsString()
  firstRegistrationDate?: string;
}
