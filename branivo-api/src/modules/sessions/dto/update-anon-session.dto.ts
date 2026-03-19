import { IsObject, IsOptional, IsString } from 'class-validator';
import type { VehicleFormData } from '../interfaces/anon-session.interface';

export class UpdateAnonSessionDto {
  @IsOptional()
  @IsObject()
  vehicle_data?: VehicleFormData;

  @IsOptional()
  @IsString()
  selected_quote_id?: string;
}
