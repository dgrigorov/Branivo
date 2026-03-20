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
import { Insurer } from './insurer.entity';

export enum QuoteStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  ERROR = 'error',
  TIMEOUT = 'timeout',
}

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'session_token', type: 'varchar', length: 255 })
  sessionToken!: string;

  @Column({ name: 'vehicle_id', nullable: true })
  vehicleId!: string | null;

  @Column({ name: 'insurer_id' })
  insurerId!: string;

  @ManyToOne(() => Insurer)
  @JoinColumn({ name: 'insurer_id' })
  insurer!: Insurer;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: QuoteStatus.PENDING,
  })
  status!: QuoteStatus;

  @Column({
    name: 'price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  price!: number | null;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'BGN' })
  currency!: string;

  @Column({ name: 'cover_details', type: 'jsonb', default: '{}' })
  coverDetails!: Record<string, unknown>;

  @Column({ name: 'extras', type: 'jsonb', default: '{}' })
  extras!: Record<string, unknown>;

  @Column({
    name: 'score',
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  score!: number | null;

  @Column({ name: 'is_recommended', type: 'boolean', default: false })
  isRecommended!: boolean;

  @Column({
    name: 'raw_response',
    type: 'jsonb',
    nullable: true,
    select: false,
  })
  rawResponse!: Record<string, unknown> | null;

  @Column({
    name: 'error_message',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  errorMessage!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
