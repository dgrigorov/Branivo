import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Quote } from '../../quotes/entities/quote.entity';
import { PiiField } from '../../../shared/decorators/pii-field.decorator';
import { PiiClassification } from '../../../shared/types/pii.types';

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

export enum PaymentMethod {
  CARD = 'card',
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay',
}

export enum PaymentProvider {
  STRIPE = 'stripe',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'quote_id' })
  quoteId!: string;

  @ManyToOne(() => Quote)
  @JoinColumn({ name: 'quote_id' })
  quote?: Quote;

  @Column({ name: 'end_client_id', nullable: true })
  endClientId!: string | null;

  @PiiField(PiiClassification.PII_SENSITIVE)
  @Column({ name: 'stripe_payment_intent_id' })
  stripePaymentIntentId!: string;

  @Column({ name: 'idempotency_key' })
  idempotencyKey!: string;

  @PiiField(PiiClassification.PII_SENSITIVE)
  @Column({ name: 'amount', type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @Column({ name: 'currency', default: 'BGN' })
  currency!: string;

  @Column({
    name: 'application_fee_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  applicationFeeAmount!: number;

  @Column({ name: 'platform_fee_pct', type: 'decimal', precision: 5, scale: 4 })
  platformFeePct!: number;

  @Column({ name: 'status', type: 'varchar', default: PaymentStatus.PENDING })
  status!: PaymentStatus;

  @PiiField(PiiClassification.PII_SENSITIVE)
  @Column({ name: 'stripe_client_secret' })
  stripeClientSecret!: string;

  @Column({ name: 'failure_reason', nullable: true })
  failureReason!: string | null;

  @Column({
    name: 'payment_method',
    type: 'varchar',
    default: PaymentMethod.CARD,
  })
  paymentMethod!: PaymentMethod;

  @Column({
    name: 'payment_provider',
    type: 'varchar',
    default: PaymentProvider.STRIPE,
  })
  paymentProvider!: PaymentProvider;

  @Column({ name: 'metadata', type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt!: Date | null;
}
