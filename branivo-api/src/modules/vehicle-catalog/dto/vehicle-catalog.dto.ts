import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

const CURRENT_YEAR = new Date().getFullYear() + 1;

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
  @IsBoolean()
  isActive?: boolean;
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
  @IsBoolean()
  isActive?: boolean;
}

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
  @Max(1000)
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
  @IsBoolean()
  isActive?: boolean;
}

export class VehicleMakeDto {
  id!: string;
  name!: string;
  vpicMakeId!: number | null;
  isActive!: boolean;
  source!: string;
  createdAt!: string;
  updatedAt!: string;
}

export class VehicleModelDto {
  id!: string;
  makeId!: string;
  makeName!: string;
  name!: string;
  vpicModelId!: number | null;
  yearFrom!: number | null;
  yearTo!: number | null;
  isActive!: boolean;
  source!: string;
  createdAt!: string;
  updatedAt!: string;
}

export class SyncVpicMakesResponseDto {
  imported!: number;
  updated!: number;
  totalProcessed!: number;
  syncedAt!: string;
}

export class SyncVpicModelsResponseDto {
  makeId!: string;
  makeName!: string;
  imported!: number;
  updated!: number;
  totalProcessed!: number;
  syncedAt!: string;
}
