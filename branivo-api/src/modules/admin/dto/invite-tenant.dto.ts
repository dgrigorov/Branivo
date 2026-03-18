import { IsEmail, IsNotEmpty, Matches } from 'class-validator';

export class InviteTenantDto {
  @IsNotEmpty()
  name!: string;

  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug may only contain lowercase letters, digits, and hyphens',
  })
  slug!: string;

  @IsEmail()
  email!: string;
}
