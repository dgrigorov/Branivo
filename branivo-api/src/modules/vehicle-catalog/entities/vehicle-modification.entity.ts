import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VehicleModelEntity } from './vehicle-model.entity';

@Entity('vehicle_modifications')
@Index('idx_vehicle_modifications_model_id', ['modelId'], {
  where: '"deleted_at" IS NULL',
})
@Index('uq_vehicle_modifications_model_name', ['modelId', 'name'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class VehicleModificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'model_id', type: 'uuid' })
  modelId!: string;

  @ManyToOne(() => VehicleModelEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'model_id' })
  model!: VehicleModelEntity;

  /** Human-readable label: e.g. "2.0 TDI 150hp (2015–2020)" */
  @Column({ name: 'name', type: 'varchar', length: 250 })
  name!: string;

  @Column({ name: 'year_from', type: 'int', nullable: true })
  yearFrom!: number | null;

  @Column({ name: 'year_to', type: 'int', nullable: true })
  yearTo!: number | null;

  /** petrol | diesel | electric | hybrid | lpg | cng */
  @Column({ name: 'engine_type', type: 'varchar', length: 30, nullable: true })
  engineType!: string | null;

  /** Engine displacement in cc, e.g. 1968 for 2.0 */
  @Column({ name: 'engine_size_cc', type: 'int', nullable: true })
  engineSizeCc!: number | null;

  @Column({ name: 'power_kw', type: 'int', nullable: true })
  powerKw!: number | null;

  @Column({ name: 'power_hp', type: 'int', nullable: true })
  powerHp!: number | null;

  @Column({ name: 'body_type', type: 'varchar', length: 60, nullable: true })
  bodyType!: string | null;

  @Column({ name: 'doors', type: 'int', nullable: true })
  doors!: number | null;

  @Column({ name: 'seats', type: 'int', nullable: true })
  seats!: number | null;

  /** manual | automatic | cvt | dsg */
  @Column({ name: 'transmission', type: 'varchar', length: 30, nullable: true })
  transmission!: string | null;

  /** fwd | rwd | awd | 4wd */
  @Column({ name: 'drive', type: 'varchar', length: 20, nullable: true })
  drive!: string | null;

  @Column({ name: 'max_speed_kmh', type: 'int', nullable: true })
  maxSpeedKmh!: number | null;

  @Column({
    name: 'acceleration_0_100',
    type: 'numeric',
    precision: 4,
    scale: 1,
    nullable: true,
  })
  acceleration0100!: number | null;

  @Column({
    name: 'fuel_consumption_city',
    type: 'numeric',
    precision: 4,
    scale: 1,
    nullable: true,
  })
  fuelConsumptionCity!: number | null;

  @Column({
    name: 'fuel_consumption_highway',
    type: 'numeric',
    precision: 4,
    scale: 1,
    nullable: true,
  })
  fuelConsumptionHighway!: number | null;

  @Column({
    name: 'fuel_consumption_combined',
    type: 'numeric',
    precision: 4,
    scale: 1,
    nullable: true,
  })
  fuelConsumptionCombined!: number | null;

  @Column({ name: 'weight_kg', type: 'int', nullable: true })
  weightKg!: number | null;

  @Column({ name: 'engine_code', type: 'varchar', length: 60, nullable: true })
  engineCode!: string | null;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl!: string | null;

  /** All raw scraped key-value pairs from autodata24 for this modification */
  @Column({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData!: Record<string, string> | null;

  /** manual | autodata24 | vpic */
  @Column({ name: 'source', type: 'varchar', length: 30, default: 'manual' })
  source!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
