import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'slug', length: 63, unique: true })
  slug!: string;

  @Column({ name: 'name', length: 255 })
  name!: string;

  @Column({ name: 'status', length: 50, default: 'invited' })
  status!: string;

  @Column({ name: 'stripe_account_id', type: 'varchar', length: 255, nullable: true })
  stripeAccountId!: string | null;

  @Column({ name: 'kfn_license', type: 'varchar', length: 100, nullable: true })
  kfnLicense!: string | null;

  @Column({ name: 'plan', length: 32, default: 'starter' })
  plan!: string;

  @Column({ name: 'features', type: 'jsonb', default: '{}' })
  features!: Record<string, boolean>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
