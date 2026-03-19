import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export type DomainStatus = 'pending' | 'verifying' | 'active' | 'failed';

@Entity({ name: 'tenant_domains' })
export class TenantDomain {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'domain', length: 255, unique: true })
  domain!: string;

  @Column({ name: 'is_primary', default: false })
  isPrimary!: boolean;

  @Column({ name: 'status', length: 20, default: 'active' })
  status!: DomainStatus;

  @Column({
    name: 'verification_token',
    length: 64,
    nullable: true,
    unique: true,
  })
  verificationToken!: string | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({ name: 'failure_reason', length: 512, nullable: true })
  failureReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
