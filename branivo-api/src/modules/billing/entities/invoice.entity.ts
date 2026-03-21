import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type InvoiceStatus = 'pending' | 'paid' | 'failed';

@Entity({ name: 'invoices' })
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: Date;

  @Column({ name: 'policies_count', type: 'integer', default: 0 })
  policiesCount!: number;

  @Column({
    name: 'total_premium',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalPremium!: number;

  @Column({
    name: 'platform_fee',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  platformFee!: number;

  @Column({
    name: 'subscription_fee',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  subscriptionFee!: number;

  @Column({
    name: 'amount_due',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  amountDue!: number;

  @Column({ name: 'is_pro_rata', type: 'boolean', default: false })
  isProRata!: boolean;

  @Column({ name: 'days_active', type: 'integer', nullable: true })
  daysActive!: number | null;

  @Column({ name: 'pdf_url', type: 'varchar', length: 500, nullable: true })
  pdfUrl!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  status!: InvoiceStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
