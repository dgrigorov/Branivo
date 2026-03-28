import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QUEUE_VEHICLE_CATALOG_SYNC } from '../../infrastructure/queues/queue.module';
import { AdminVehicleCatalogController } from './admin-vehicle-catalog.controller';
import { VehicleCatalogController } from './vehicle-catalog.controller';
import { VehicleCatalogImportService } from './vehicle-catalog-import.service';
import { VehicleCatalogSyncProcessor } from './vehicle-catalog-sync.processor';
import { VehicleCatalogSyncService } from './vehicle-catalog-sync.service';
import { VehicleCatalogService } from './vehicle-catalog.service';
import { VehicleMakeService } from './vehicle-make.service';
import { VehicleModelService } from './vehicle-model.service';
import { VehicleModificationService } from './vehicle-modification.service';
import { VehicleCatalogSyncRunEntity } from './entities/vehicle-catalog-sync-run.entity';
import { VehicleMakeEntity } from './entities/vehicle-make.entity';
import { VehicleModelEntity } from './entities/vehicle-model.entity';
import { VehicleModificationEntity } from './entities/vehicle-modification.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VehicleMakeEntity,
      VehicleModelEntity,
      VehicleModificationEntity,
      VehicleCatalogSyncRunEntity,
    ]),
    BullModule.registerQueue({ name: QUEUE_VEHICLE_CATALOG_SYNC }),
  ],
  controllers: [VehicleCatalogController, AdminVehicleCatalogController],
  providers: [
    VehicleMakeService,
    VehicleModelService,
    VehicleModificationService,
    VehicleCatalogService,
    VehicleCatalogSyncService,
    VehicleCatalogImportService,
    VehicleCatalogSyncProcessor,
  ],
  exports: [VehicleCatalogService],
})
export class VehicleCatalogModule {}
