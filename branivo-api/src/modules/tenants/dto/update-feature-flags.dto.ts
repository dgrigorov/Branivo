import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateFeatureFlagsDto {
  @IsOptional() @IsBoolean() fleet?: boolean;
  @IsOptional() @IsBoolean() kasko?: boolean;
  @IsOptional() @IsBoolean() api_access?: boolean;
  @IsOptional() @IsBoolean() sticker_delivery?: boolean;
  @IsOptional() @IsBoolean() dkp?: boolean;
  @IsOptional() @IsBoolean() renewal_sms?: boolean;
  @IsOptional() @IsBoolean() renewal_push?: boolean;
}
