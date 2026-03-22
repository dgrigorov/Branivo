import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { TenantsModule } from '../tenants/tenants.module';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { FleetRepository } from './fleet.repository';
import { FleetVehicle } from './entities/fleet-vehicle.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([FleetVehicle]),
    TenantContextModule,
    TenantsModule,
  ],
  controllers: [FleetController],
  providers: [FleetService, FleetRepository],
})
export class FleetModule {}
