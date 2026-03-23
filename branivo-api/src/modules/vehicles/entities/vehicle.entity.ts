import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PiiField } from '../../../shared/decorators/pii-field.decorator';
import { PiiClassification } from '../../../shared/types/pii.types';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'owner_id' })
  ownerId!: string;

  @PiiField(PiiClassification.PII_BASIC)
  @Column({ name: 'vin' })
  vin!: string;

  @PiiField(PiiClassification.PII_BASIC)
  @Column({ name: 'license_plate' })
  licensePlate!: string;

  @Column({ name: 'make' })
  make!: string;

  @Column({ name: 'model' })
  model!: string;

  @Column({ name: 'year', type: 'int' })
  year!: number;

  @Column({ name: 'color', nullable: true, type: 'varchar', length: 50 })
  color!: string | null;

  @Column({
    name: 'engine_volume',
    nullable: true,
    type: 'varchar',
    length: 20,
  })
  engineVolume!: string | null;

  @Column({ name: 'fuel_type', nullable: true, type: 'varchar', length: 30 })
  fuelType!: string | null;

  @Column({ name: 'first_registration_date', nullable: true, type: 'date' })
  firstRegistrationDate!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
