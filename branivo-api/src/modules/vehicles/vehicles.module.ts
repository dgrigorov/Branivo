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

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle]),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 2,
    }),
    TenantContextModule,
  ],
  controllers: [VehiclesController],
  providers: [
    VehiclesService,
    VehiclesRepository,
    KatApiAdapter,
    GarantsionenFondAdapter,
  ],
  exports: [VehiclesService],
})
export class VehiclesModule {}
