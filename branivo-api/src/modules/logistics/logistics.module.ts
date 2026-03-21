import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '../../infrastructure/queues/queue.module';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { TenantsModule } from '../tenants/tenants.module';
import { PoliciesModule } from '../policies/policies.module';
import { NotificationsService } from '../notifications/notifications.service';
import { Shipment } from './entities/shipment.entity';
import { LogisticsService } from './logistics.service';
import { LogisticsProcessor } from './logistics.processor';
import { ShipmentsRepository } from './shipments.repository';
import { SpeedyAdapter } from './adapters/speedy.adapter';
import { EcontAdapter } from './adapters/econt.adapter';
import { ManualAdapter } from './adapters/manual.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shipment]),
    QueueModule,
    TenantContextModule,
    TenantsModule,
    PoliciesModule,
  ],
  providers: [
    LogisticsService,
    LogisticsProcessor,
    ShipmentsRepository,
    SpeedyAdapter,
    EcontAdapter,
    ManualAdapter,
    NotificationsService,
  ],
  exports: [LogisticsService, ShipmentsRepository],
})
export class LogisticsModule {}
