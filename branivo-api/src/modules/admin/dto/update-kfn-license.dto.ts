import { IsNotEmpty, Matches } from 'class-validator';

export const KFN_LICENSE_REGEX = /^[0-9]{3,10}$/;
export const KFN_LICENSE_REGEX_MESSAGE =
  'Invalid КФН license format (3–10 digits required)';

export class UpdateKfnLicenseDto {
  @IsNotEmpty()
  @Matches(KFN_LICENSE_REGEX, { message: KFN_LICENSE_REGEX_MESSAGE })
  kfn_license!: string;
}
