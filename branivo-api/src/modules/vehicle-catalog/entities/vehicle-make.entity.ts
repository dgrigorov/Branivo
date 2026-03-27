import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VehicleModelEntity } from './vehicle-model.entity';

@Entity('vehicle_makes')
@Index('uq_vehicle_makes_normalized_name', ['normalizedName'], {
  unique: true,
})
@Index('uq_vehicle_makes_vpic_make_id', ['vpicMakeId'], {
  unique: true,
  where: 'vpic_make_id IS NOT NULL',
})
export class VehicleMakeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'normalized_name', type: 'varchar', length: 120 })
  normalizedName!: string;

  @Column({ name: 'vpic_make_id', type: 'int', nullable: true })
  vpicMakeId!: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'source', type: 'varchar', length: 20, default: 'manual' })
  source!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => VehicleModelEntity, (model) => model.make)
  models!: VehicleModelEntity[];
}
