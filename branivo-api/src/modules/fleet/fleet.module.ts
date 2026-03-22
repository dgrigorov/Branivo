import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { TenantsModule } from '../tenants/tenants.module';
import { QuotesModule } from '../quotes/quotes.module';
import { PaymentsModule } from '../payments/payments.module';
import { PoliciesModule } from '../policies/policies.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { S3Module } from '../../infrastructure/s3/s3.module';
import { QUEUE_PDF_GENERATION } from '../../infrastructure/queues/queue.module';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { FleetBulkService } from './fleet-bulk.service';
import { FleetPdfExportService } from './fleet-pdf-export.service';
import { FleetPdfBatchProcessor } from './fleet-pdf-batch.processor';
import { FleetRepository } from './fleet.repository';
import { FleetPdfExportRepository } from './fleet-pdf-export.repository';
import { FleetVehicle } from './entities/fleet-vehicle.entity';
import { FleetPdfExport } from './entities/fleet-pdf-export.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([FleetVehicle, FleetPdfExport]),
    BullModule.registerQueue({ name: QUEUE_PDF_GENERATION }),
    TenantContextModule,
    TenantsModule,
    QuotesModule,
    PaymentsModule,
    PoliciesModule,
    NotificationsModule,
    S3Module,
  ],
  controllers: [FleetController],
  providers: [
    FleetService,
    FleetBulkService,
    FleetPdfExportService,
    FleetPdfBatchProcessor,
    FleetRepository,
    FleetPdfExportRepository,
  ],
})
export class FleetModule {}
