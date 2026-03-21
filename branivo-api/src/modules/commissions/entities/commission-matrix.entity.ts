import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Insurer } from '../../quotes/entities/insurer.entity';
import { ProductType } from '../enums/product-type.enum';

@Entity('commission_matrix')
export class CommissionMatrix {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'insurer_id' })
  insurerId!: string;

  @ManyToOne(() => Insurer)
  @JoinColumn({ name: 'insurer_id' })
  insurer!: Insurer;

  @Column({
    name: 'product_type',
    type: 'varchar',
    length: 20,
  })
  productType!: ProductType;

  @Column({
    name: 'rate_pct',
    type: 'decimal',
    precision: 5,
    scale: 4,
  })
  ratePct!: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
