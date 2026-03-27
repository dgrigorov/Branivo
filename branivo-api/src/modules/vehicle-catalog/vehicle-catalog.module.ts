import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminVehicleCatalogController } from './admin-vehicle-catalog.controller';
import { VehicleCatalogController } from './vehicle-catalog.controller';
import { VehicleCatalogService } from './vehicle-catalog.service';
import { VehicleMakeEntity } from './entities/vehicle-make.entity';
import { VehicleModelEntity } from './entities/vehicle-model.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleMakeEntity, VehicleModelEntity])],
  controllers: [VehicleCatalogController, AdminVehicleCatalogController],
  providers: [VehicleCatalogService],
  exports: [VehicleCatalogService],
})
export class VehicleCatalogModule {}
