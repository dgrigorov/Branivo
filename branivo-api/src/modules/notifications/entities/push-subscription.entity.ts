import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EndClient } from '../../clients/entities/end-client.entity';

export type PushSubscriptionType = 'web' | 'fcm';

@Entity('push_subscriptions')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'customer_id' })
  customerId!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'endpoint', type: 'text' })
  endpoint!: string;

  @Column({ name: 'p256dh', type: 'text' })
  p256dh!: string;

  @Column({ name: 'auth', type: 'text' })
  auth!: string;

  @Column({ name: 'type', length: 10, default: 'web' })
  type!: PushSubscriptionType;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => EndClient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: EndClient;
}
