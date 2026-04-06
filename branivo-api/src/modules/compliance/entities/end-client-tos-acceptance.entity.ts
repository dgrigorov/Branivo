import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TenantTosVersion } from './tenant-tos-version.entity';

@Entity({ name: 'end_client_tos_acceptances' })
export class EndClientTosAcceptance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'tos_version_id', type: 'uuid' })
  tosVersionId!: string;

  @ManyToOne(() => TenantTosVersion)
  @JoinColumn({ name: 'tos_version_id' })
  tosVersion!: TenantTosVersion;

  @Column({ name: 'accepted_at', type: 'timestamptz', default: () => 'NOW()' })
  acceptedAt!: Date;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;
}
