import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export const VEHICLE_BODY_TYPES = [
  'sedan',
  'hatchback',
  'station_wagon',
  'suv',
  'crossover',
  'coupe',
  'convertible',
  'minivan',
  'van',
  'pickup',
  'minibus',
  'other',
] as const;

export type VehicleBodyType = (typeof VEHICLE_BODY_TYPES)[number];

export const VEHICLE_ENGINE_TYPES = [
  'petrol',
  'diesel',
  'electric',
  'hybrid',
  'lpg',
  'cng',
  'other',
] as const;

export type VehicleEngineType = (typeof VEHICLE_ENGINE_TYPES)[number];

export const VEHICLE_TRANSMISSIONS = [
  'manual',
  'automatic',
  'cvt',
  'dsg',
  'other',
] as const;

export const VEHICLE_DRIVES = ['fwd', 'rwd', 'awd', '4wd'] as const;

const CURRENT_YEAR = new Date().getFullYear() + 1;

// ─── Make ────────────────────────────────────────────────────────────────────

export class VehicleMakeQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export class CreateVehicleMakeDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vpicMakeId?: number;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  autodata24Slug?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;
}

export class UpdateVehicleMakeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vpicMakeId?: number;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  autodata24Slug?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;
}

export class VehicleMakeDto {
  id!: string;
  name!: string;
  vpicMakeId!: number | null;
  logoUrl!: string | null;
  autodata24Slug!: string | null;
  isActive!: boolean;
  isPopular!: boolean;
  source!: string;
  createdAt!: string;
  updatedAt!: string;
}

// ─── Model ───────────────────────────────────────────────────────────────────

export class VehicleModelQueryDto {
  @IsOptional()
  @IsUUID()
  makeId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;
}

export class CreateVehicleModelDto {
  @IsUUID()
  makeId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vpicModelId?: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  autodata24Slug?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(CURRENT_YEAR)
  yearFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(CURRENT_YEAR)
  yearTo?: number;

  @IsOptional()
  @IsString()
  @IsIn(VEHICLE_BODY_TYPES)
  bodyType?: VehicleBodyType;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVehicleModelDto {
  @IsOptional()
  @IsUUID()
  makeId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vpicModelId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(CURRENT_YEAR)
  yearFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(CURRENT_YEAR)
  yearTo?: number;

  @IsOptional()
  @IsString()
  @IsIn(VEHICLE_BODY_TYPES)
  bodyType?: VehicleBodyType;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class VehicleModelDto {
  id!: string;
  makeId!: string;
  makeName!: string;
  name!: string;
  vpicModelId!: number | null;
  autodata24Slug!: string | null;
  yearFrom!: number | null;
  yearTo!: number | null;
  bodyType!: string | null;
  imageUrl!: string | null;
  modificationsCount!: number;
  isActive!: boolean;
  source!: string;
  createdAt!: string;
  updatedAt!: string;
}

// ─── Modification ─────────────────────────────────────────────────────────────

export class VehicleModificationQueryDto {
  @IsUUID()
  modelId!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class CreateVehicleModificationDto {
  @IsUUID()
  modelId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 250)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(CURRENT_YEAR)
  yearFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(CURRENT_YEAR)
  yearTo?: number;

  @IsOptional()
  @IsString()
  @IsIn(VEHICLE_ENGINE_TYPES)
  engineType?: VehicleEngineType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  engineSizeCc?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3000)
  powerKw?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4000)
  powerHp?: number;

  @IsOptional()
  @IsString()
  @IsIn(VEHICLE_BODY_TYPES)
  bodyType?: VehicleBodyType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(6)
  doors?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  seats?: number;

  @IsOptional()
  @IsString()
  @IsIn(VEHICLE_TRANSMISSIONS)
  transmission?: string;

  @IsOptional()
  @IsString()
  @IsIn(VEHICLE_DRIVES)
  drive?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxSpeedKmh?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(60)
  acceleration0100?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  fuelConsumptionCity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  fuelConsumptionHighway?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  fuelConsumptionCombined?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  weightKg?: number;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  engineCode?: string;

  @IsOptional()
  @IsObject()
  rawData?: Record<string, string>;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  source?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVehicleModificationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 250)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(CURRENT_YEAR)
  yearFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(CURRENT_YEAR)
  yearTo?: number;

  @IsOptional()
  @IsString()
  @IsIn(VEHICLE_ENGINE_TYPES)
  engineType?: VehicleEngineType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  engineSizeCc?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3000)
  powerKw?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4000)
  powerHp?: number;

  @IsOptional()
  @IsString()
  @IsIn(VEHICLE_BODY_TYPES)
  bodyType?: VehicleBodyType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(6)
  doors?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  seats?: number;

  @IsOptional()
  @IsString()
  @IsIn(VEHICLE_TRANSMISSIONS)
  transmission?: string;

  @IsOptional()
  @IsString()
  @IsIn(VEHICLE_DRIVES)
  drive?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class VehicleModificationDto {
  id!: string;
  modelId!: string;
  name!: string;
  imageUrl!: string | null;
  yearFrom!: number | null;
  yearTo!: number | null;
  engineType!: string | null;
  engineSizeCc!: number | null;
  powerKw!: number | null;
  powerHp!: number | null;
  bodyType!: string | null;
  doors!: number | null;
  seats!: number | null;
  transmission!: string | null;
  drive!: string | null;
  maxSpeedKmh!: number | null;
  acceleration0100!: number | null;
  fuelConsumptionCity!: number | null;
  fuelConsumptionHighway!: number | null;
  fuelConsumptionCombined!: number | null;
  weightKg!: number | null;
  engineCode!: string | null;
  rawData!: Record<string, string> | null;
  source!: string;
  isActive!: boolean;
  createdAt!: string;
  updatedAt!: string;
}
