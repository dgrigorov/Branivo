import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { RenewalStage } from '../renewal.repository';

@Entity('renewal_notification_log')
export class RenewalNotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'policy_id', type: 'uuid' })
  policyId!: string;

  @Column({ name: 'stage', type: 'varchar', length: 20 })
  stage!: RenewalStage;

  @Column({ name: 'queued_at', type: 'timestamptz', default: () => 'NOW()' })
  queuedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
