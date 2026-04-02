import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ArrayMinSize,
} from 'class-validator';
import { Transform } from 'class-transformer';

export type EnrichField = 'kat' | 'gf' | 'nhtsa';
const VALID_FIELDS: EnrichField[] = ['kat', 'gf', 'nhtsa'];

export class EnrichVehicleQueryDto {
  @IsOptional()
  @IsString()
  reg_number?: string;

  @IsOptional()
  @IsString()
  vin?: string;

  /**
   * Comma-separated list of fields to enrich. Defaults to all if omitted.
   * Accepts "kat,gf,nhtsa" or "kat,gf" etc.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string' || !value.trim()) return VALID_FIELDS;
    const parts = value.split(',').map((p) => p.trim().toLowerCase());
    // Deduplicate
    const unique = [...new Set(parts)];
    return unique;
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(VALID_FIELDS, { each: true })
  fields: EnrichField[] = VALID_FIELDS;
}
