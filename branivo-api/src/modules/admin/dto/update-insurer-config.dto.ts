import {
  IsString,
  IsOptional,
  MaxLength,
  IsUrl,
  IsUUID,
  IsNumber,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';

export class UpdateInsurerConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  adapterClass?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(500)
  apiEndpoint?: string;

  @IsOptional()
  @IsUUID()
  fscInsurerId?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(1000)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  rating?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  claimSpeed?: number;
}
