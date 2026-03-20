import {
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class VehicleDataDto {
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
}
