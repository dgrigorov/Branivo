import { IsBoolean } from 'class-validator';

export class SaveCookieConsentDto {
  @IsBoolean()
  necessary!: boolean;

  @IsBoolean()
  analytics!: boolean;

  @IsBoolean()
  marketing!: boolean;

  @IsBoolean()
  functional!: boolean;
}
