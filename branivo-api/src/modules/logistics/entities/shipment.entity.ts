import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { DeliveryAddress } from '../interfaces/delivery-address.interface';

@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'policy_id' })
  policyId!: string;

  @Column({ name: 'provider', type: 'varchar', length: 20 })
  provider!: 'speedy' | 'econt' | 'manual';

  @Column({ name: 'tracking_number', nullable: true })
  trackingNumber!: string | null;

  @Column({ name: 'estimated_delivery_date', type: 'date', nullable: true })
  estimatedDeliveryDate!: Date | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  status!: 'pending' | 'dispatched' | 'delivered' | 'failed';

  @Column({ name: 'receipt_s3_key', nullable: true })
  receiptS3Key!: string | null;

  @Column({ name: 'delivery_address', type: 'jsonb' })
  deliveryAddress!: DeliveryAddress;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
