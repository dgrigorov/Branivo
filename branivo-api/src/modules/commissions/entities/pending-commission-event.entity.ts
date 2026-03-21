import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CommissionEventStatus = 'pending' | 'confirmed' | 'failed';
export type CommissionProductType = 'GO' | 'KASKO' | 'PROPERTY';

@Entity('pending_commission_events')
export class PendingCommissionEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @Column({ name: 'insurer_id', type: 'uuid' })
  insurerId!: string;

  @Column({ name: 'product_type', type: 'varchar', length: 20 })
  productType!: CommissionProductType;

  @Column({
    name: 'premium_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  premiumAmount!: number;

  @Column({
    name: 'commission_pct',
    type: 'decimal',
    precision: 5,
    scale: 4,
  })
  commissionPct!: number;

  @Column({
    name: 'commission_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  commissionAmount!: number;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pending' })
  status!: CommissionEventStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
