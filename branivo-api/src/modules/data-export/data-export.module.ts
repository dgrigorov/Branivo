import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { QueueModule } from '../../infrastructure/queues/queue.module';
import { S3Module } from '../../infrastructure/s3/s3.module';
import { EmailModule } from '../../infrastructure/email/email.module';
import { ClientsModule } from '../clients/clients.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { PoliciesModule } from '../policies/policies.module';
import { PaymentsModule } from '../payments/payments.module';
import { DataExportRequest } from './entities/data-export-request.entity';
import { DataExportRepository } from './data-export.repository';
import { DataExportService } from './data-export.service';
import { DataExportProcessor } from './data-export.processor';
import { DataAggregatorService } from './data-aggregator.service';
import { DataExportController } from './data-export.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DataExportRequest]),
    TenantContextModule,
    QueueModule, // регистрира и експортва всички queues, включително QUEUE_DATA_EXPORT
    S3Module,
    EmailModule,
    ClientsModule,
    VehiclesModule,
    PoliciesModule,
    PaymentsModule,
  ],
  providers: [
    DataExportService,
    DataExportRepository,
    DataExportProcessor,
    DataAggregatorService,
  ],
  controllers: [DataExportController],
})
export class DataExportModule {}
