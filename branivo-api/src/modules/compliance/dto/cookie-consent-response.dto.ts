export class CookieConsentResponseDto {
  necessary!: boolean;
  analytics!: boolean;
  marketing!: boolean;
  functional!: boolean;
  consentedAt!: string | null;
  policyVersion!: number | null;
}

export class SaveCookieConsentResponseDto {
  saved!: boolean;
  consentedAt!: string;
}
