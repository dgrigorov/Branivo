export class TenantConfigResponseDto {
  id!: string;
  slug!: string;
  name!: string;
  status!: string;
  plan!: string;
  features!: Record<string, boolean>;
  branding!: {
    primaryColor: string;
    secondaryColor: string | null;
    brandFont: string | null;
    logoUrl: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
  };
}
