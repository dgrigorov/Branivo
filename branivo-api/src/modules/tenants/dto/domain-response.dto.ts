import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DomainStatus } from '../entities/tenant-domain.entity';

export class DnsVerificationRecord {
  @ApiProperty({ example: '_branivo-verify.polici.mybrokerage.bg' })
  name!: string;

  @ApiProperty({ example: 'TXT' })
  type!: 'TXT';

  @ApiProperty({ example: 'branivo-verify=abc123...' })
  value!: string;
}

export class DomainResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'polici.mybrokerage.bg' })
  domain!: string;

  @ApiProperty({
    description: 'True for the system-managed {slug}.branivo.bg subdomain',
  })
  isPrimary!: boolean;

  @ApiProperty({ enum: ['pending', 'verifying', 'active', 'failed'] })
  status!: DomainStatus;

  @ApiPropertyOptional({
    type: DnsVerificationRecord,
    nullable: true,
    description: 'DNS record to add. Null when status is active.',
  })
  verificationRecord!: DnsVerificationRecord | null;

  @ApiPropertyOptional({ nullable: true })
  verifiedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  failureReason!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
