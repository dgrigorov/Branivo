import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class RegisterDomainDto {
  @ApiProperty({
    example: 'polici.mybrokerage.bg',
    description: 'Custom domain to register for this tenant portal',
  })
  @IsString()
  @MaxLength(255)
  @Matches(/^(?!-)(?:[a-zA-Z0-9-]{1,63}(?<!-)\.)+[a-zA-Z]{2,}$/, {
    message:
      'domain must be a valid hostname (e.g. polici.mybrokerage.bg). IP addresses are not allowed.',
  })
  @Matches(/^(?!.*\.branivo\.bg$)/, {
    message: 'Branivo-owned domains cannot be registered as custom domains.',
  })
  domain!: string;
}
