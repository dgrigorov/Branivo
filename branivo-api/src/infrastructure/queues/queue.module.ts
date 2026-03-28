import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const QUEUE_PDF_GENERATION = 'pdf-generation';
export const QUEUE_NOTIFICATIONS = 'notifications';
export const QUEUE_LOGISTICS = 'logistics';
export const QUEUE_OCR_PROCESSING = 'ocr-processing';
export const QUEUE_WEBHOOK_PROCESSING = 'webhook-processing';
export const QUEUE_BILLING = 'billing';
export const QUEUE_DATA_EXPORT = 'data-export';
export const QUEUE_VEHICLE_CATALOG_SYNC = 'vehicle-catalog-sync';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: config.getOrThrow<string>('REDIS_URL'),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_PDF_GENERATION },
      { name: QUEUE_NOTIFICATIONS },
      { name: QUEUE_LOGISTICS },
      { name: QUEUE_OCR_PROCESSING },
      { name: QUEUE_WEBHOOK_PROCESSING },
      { name: QUEUE_BILLING },
      { name: QUEUE_DATA_EXPORT },
      { name: QUEUE_VEHICLE_CATALOG_SYNC },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
