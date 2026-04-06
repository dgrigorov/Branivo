import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EndClient } from '../../clients/entities/end-client.entity';

@Entity({ name: 'cookie_consent_records' })
export class CookieConsentRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId!: string | null;

  @ManyToOne(() => EndClient, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client!: EndClient | null;

  @Column({ type: 'boolean', default: true })
  necessary!: boolean;

  @Column({ type: 'boolean', default: false })
  analytics!: boolean;

  @Column({ type: 'boolean', default: false })
  marketing!: boolean;

  @Column({ type: 'boolean', default: false })
  functional!: boolean;

  @Column({ name: 'policy_version', type: 'integer', nullable: true })
  policyVersion!: number | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'consented_at', type: 'timestamptz' })
  consentedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
