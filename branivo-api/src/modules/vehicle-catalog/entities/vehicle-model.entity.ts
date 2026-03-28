import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VehicleMakeEntity } from './vehicle-make.entity';
import { VehicleModificationEntity } from './vehicle-modification.entity';

@Entity('vehicle_models')
@Index('idx_vehicle_models_make_id', ['makeId'])
@Index(
  'uq_vehicle_models_make_id_normalized_name',
  ['makeId', 'normalizedName'],
  {
    unique: true,
  },
)
@Index('uq_vehicle_models_vpic_model_id', ['vpicModelId'], {
  unique: true,
  where: 'vpic_model_id IS NOT NULL',
})
export class VehicleModelEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'make_id', type: 'uuid' })
  makeId!: string;

  @ManyToOne(() => VehicleMakeEntity, (make) => make.models, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'make_id' })
  make!: VehicleMakeEntity;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'normalized_name', type: 'varchar', length: 120 })
  normalizedName!: string;

  @Column({ name: 'vpic_model_id', type: 'int', nullable: true })
  vpicModelId!: number | null;

  @Column({
    name: 'autodata24_slug',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  autodata24Slug!: string | null;

  @Column({ name: 'year_from', type: 'int', nullable: true })
  yearFrom!: number | null;

  @Column({ name: 'year_to', type: 'int', nullable: true })
  yearTo!: number | null;

  @Column({ name: 'body_type', type: 'varchar', length: 60, nullable: true })
  bodyType!: string | null;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl!: string | null;

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

  @OneToMany(() => VehicleModificationEntity, (mod) => mod.model)
  modifications!: VehicleModificationEntity[];
}
