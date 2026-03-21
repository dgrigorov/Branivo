import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PolicyStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

@Entity('policies')
export class Policy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'payment_id' })
  paymentId!: string;

  @Column({ name: 'quote_id' })
  quoteId!: string;

  @Column({ name: 'end_client_id', nullable: true })
  endClientId?: string;

  @Column({ name: 'insurer_id' })
  insurerId!: string;

  @Column({ name: 'policy_number' })
  policyNumber!: string;

  @Column({ name: 'status', type: 'varchar', default: PolicyStatus.PENDING })
  status!: PolicyStatus;

  @Column({ name: 'stripe_payment_intent_id' })
  stripePaymentIntentId!: string;

  @Column({ name: 'premium_amount', type: 'decimal', precision: 10, scale: 2 })
  premiumAmount!: number;

  @Column({
    name: 'commission_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  commissionAmount!: number; // IMMUTABLE snapshot

  @Column({ name: 'commission_pct', type: 'decimal', precision: 5, scale: 4 })
  commissionPct!: number; // IMMUTABLE snapshot

  @Column({ name: 'currency', default: 'BGN' })
  currency!: string;

  @Column({ name: 'vehicle_id', nullable: true })
  vehicleId?: string;

  @Column({ name: 'coverage_start_date', type: 'date', nullable: true })
  coverageStartDate?: Date;

  @Column({ name: 'coverage_end_date', type: 'date', nullable: true })
  coverageEndDate?: Date;

  @Column({ name: 'policy_pdf_s3_key', nullable: true })
  policyPdfS3Key?: string;

  @Column({ name: 'green_card_pdf_s3_key', nullable: true })
  greenCardPdfS3Key?: string;

  @Column({ name: 'documents_emailed_at', type: 'timestamptz', nullable: true })
  documentsEmailedAt?: Date;

  @Column({ name: 'metadata', type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt!: Date | null;
}
