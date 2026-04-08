import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';

export type BreachType =
  | 'unauthorized_access'
  | 'data_loss'
  | 'data_exposure'
  | 'ransomware'
  | 'accidental_disclosure'
  | 'insider_threat'
  | 'other';

export type BreachSeverity = 'low' | 'medium' | 'high' | 'critical';

export type BreachStatus =
  | 'detected'
  | 'investigating'
  | 'contained'
  | 'notified_kzld'
  | 'notified_clients'
  | 'closed';

export type DataCategory =
  | 'name'
  | 'email'
  | 'phone'
  | 'egn'
  | 'address'
  | 'payment_data'
  | 'vehicle_data'
  | 'policy_data'
  | 'health_data'
  | 'other';

@Entity({ name: 'data_breaches' })
export class DataBreach {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant | null;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'description', type: 'text' })
  description!: string;

  @Column({ name: 'breach_type', type: 'varchar', length: 50 })
  breachType!: BreachType;

  @Column({ name: 'severity', type: 'varchar', length: 20 })
  severity!: BreachSeverity;

  @Column({ name: 'detected_at', type: 'timestamptz' })
  detectedAt!: Date;

  @Column({ name: 'reported_by', type: 'uuid', nullable: true })
  reportedBy!: string | null;

  @Column({
    name: 'affected_data_categories',
    type: 'jsonb',
    default: '[]',
  })
  affectedDataCategories!: DataCategory[];

  @Column({ name: 'affected_subjects_count', type: 'integer', nullable: true })
  affectedSubjectsCount!: number | null;

  @Column({
    name: 'affected_subjects_description',
    type: 'text',
    nullable: true,
  })
  affectedSubjectsDescription!: string | null;

  @Column({
    name: 'kzld_notification_required',
    type: 'boolean',
    default: true,
  })
  kzldNotificationRequired!: boolean;

  @Column({ name: 'kzld_notified_at', type: 'timestamptz', nullable: true })
  kzldNotifiedAt!: Date | null;

  @Column({
    name: 'kzld_notification_reference',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  kzldNotificationReference!: string | null;

  @Column({ name: 'kzld_notification_deadline', type: 'timestamptz' })
  kzldNotificationDeadline!: Date;

  @Column({
    name: 'client_notification_required',
    type: 'boolean',
    default: false,
  })
  clientNotificationRequired!: boolean;

  @Column({
    name: 'client_notification_sent_at',
    type: 'timestamptz',
    nullable: true,
  })
  clientNotificationSentAt!: Date | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: 'detected',
  })
  status!: BreachStatus;

  @Column({ name: 'containment_actions', type: 'text', nullable: true })
  containmentActions!: string | null;

  @Column({ name: 'remediation_actions', type: 'text', nullable: true })
  remediationActions!: string | null;

  @Column({ name: 'lessons_learned', type: 'text', nullable: true })
  lessonsLearned!: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
