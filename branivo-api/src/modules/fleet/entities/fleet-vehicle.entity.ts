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
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { User } from '../../users/entities/user.entity';

@Entity('fleet_vehicles')
export class FleetVehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'vehicle_id' })
  vehicleId!: string;

  @Column({ name: 'driver_user_id', type: 'uuid', nullable: true })
  driverUserId!: string | null;

  @ManyToOne(() => Vehicle, { nullable: false })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: Vehicle;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'driver_user_id' })
  driverUser!: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
