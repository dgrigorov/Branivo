import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('insurers')
export class Insurer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'code', type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'rating', type: 'decimal', precision: 3, scale: 2 })
  rating!: number;

  @Column({ name: 'claim_speed', type: 'decimal', precision: 3, scale: 1 })
  claimSpeed!: number;

  @Column({ name: 'extras_config', type: 'jsonb', default: '{}' })
  extrasConfig!: Record<string, unknown>;

  @Column({ name: 'adapter_class', type: 'varchar', length: 100 })
  adapterClass!: string;

  @Column({
    name: 'api_endpoint',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  apiEndpoint!: string | null;

  // NEVER return this field in any GET response
  @Column({
    name: 'api_key_enc',
    type: 'varchar',
    length: 500,
    nullable: true,
    select: false,
  })
  apiKeyEnc!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
