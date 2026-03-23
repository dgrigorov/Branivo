import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum PolicyEventType {
  ACTIVATED = 'policy.activated',
  FAILED = 'policy.failed',
  PDF_QUEUED = 'policy.pdf_queued',
  DOCUMENTS_DELIVERED = 'policy.documents_delivered',
}

@Entity('policy_events')
export class PolicyEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'policy_id' })
  policyId!: string;

  @Column({ name: 'event_type' })
  eventType!: PolicyEventType;

  @Column({ name: 'payload', type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @Index('uq_policy_events_stripe_event_id', {
    unique: true,
    where: '"stripe_event_id" IS NOT NULL',
  })
  @Column({ name: 'stripe_event_id', nullable: true })
  stripeEventId?: string;

  @Column({ name: 'created_by', default: 'system' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
  // БЕЗ updated_at, deleted_at — IMMUTABLE record
}
