import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehiclesRepository } from './vehicles.repository';
import { KatApiAdapter } from './adapters/kat-api.adapter';
import { GarantsionenFondAdapter } from './adapters/garantsionen-fond.adapter';
import { Vehicle } from './entities/vehicle.entity';
import { VehicleEnrichmentController } from './vehicle-enrichment.controller';
import { VehicleEnrichmentService } from './vehicle-enrichment.service';
import { Policy } from '../policies/entities/policy.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, Policy]),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 2,
    }),
    TenantContextModule,
  ],
  controllers: [VehiclesController, VehicleEnrichmentController],
  providers: [
    VehiclesService,
    VehiclesRepository,
    KatApiAdapter,
    GarantsionenFondAdapter,
    VehicleEnrichmentService,
  ],
  exports: [VehiclesService, VehiclesRepository],
})
export class VehiclesModule {}
