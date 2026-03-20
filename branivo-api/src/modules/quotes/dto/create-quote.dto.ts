import {
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleDataDto } from './vehicle-data.dto';

export class CreateQuoteDto {
  @IsString()
  @IsNotEmpty()
  sessionToken!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VehicleDataDto)
  vehicleData?: VehicleDataDto;
}
