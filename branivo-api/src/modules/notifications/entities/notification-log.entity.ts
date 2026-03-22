import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { RenewalStage } from '../../renewal/renewal.repository';

export type NotificationChannel = 'push' | 'sms' | 'email' | 'dashboard';
export type NotificationStatus =
  | 'sent'
  | 'push_skipped'
  | 'sms_failed'
  | 'failed';

@Entity('notification_log')
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'policy_id' })
  policyId!: string;

  @Column({ name: 'stage', length: 20 })
  stage!: RenewalStage;

  @Column({ name: 'channel', length: 20 })
  channel!: NotificationChannel;

  @Column({ name: 'status', length: 20 })
  status!: NotificationStatus;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
