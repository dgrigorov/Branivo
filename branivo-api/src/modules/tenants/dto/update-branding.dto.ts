import { IsHexColor, IsIn, IsOptional } from 'class-validator';

export const APPROVED_FONTS = [
  'Inter',
  'Roboto',
  'Lato',
  'Poppins',
  'Open Sans',
] as const;

export type ApprovedFont = (typeof APPROVED_FONTS)[number];

export class UpdateBrandingDto {
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsHexColor()
  secondaryColor?: string;

  @IsOptional()
  @IsIn(APPROVED_FONTS)
  brandFont?: ApprovedFont;
}
