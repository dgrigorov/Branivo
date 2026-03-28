import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminVehicleCatalogController } from './admin-vehicle-catalog.controller';
import { VehicleCatalogController } from './vehicle-catalog.controller';
import { VehicleCatalogService } from './vehicle-catalog.service';
import { VehicleMakeService } from './vehicle-make.service';
import { VehicleModelService } from './vehicle-model.service';
import { VehicleModificationService } from './vehicle-modification.service';
import { VehicleMakeEntity } from './entities/vehicle-make.entity';
import { VehicleModelEntity } from './entities/vehicle-model.entity';
import { VehicleModificationEntity } from './entities/vehicle-modification.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VehicleMakeEntity,
      VehicleModelEntity,
      VehicleModificationEntity,
    ]),
  ],
  controllers: [VehicleCatalogController, AdminVehicleCatalogController],
  providers: [
    VehicleMakeService,
    VehicleModelService,
    VehicleModificationService,
    VehicleCatalogService,
  ],
  exports: [VehicleCatalogService],
})
export class VehicleCatalogModule {}
