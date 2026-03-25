import { IsHexColor, IsIn, IsOptional, Matches } from 'class-validator';

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

  @IsOptional()
  @Matches(/^\d{9}(\d{4})?$/, {
    message: 'einCode трябва да е валиден БУЛСТАТ (9 или 13 цифри)',
  })
  einCode?: string;
}
