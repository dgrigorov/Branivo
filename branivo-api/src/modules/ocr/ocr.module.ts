import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { OcrJobRepository } from './ocr-job.repository';
import { OcrScanRepository } from './ocr-scan.repository';
import { OcrProcessor } from './ocr.processor';
import { OcrQueueProducer, QUEUE_OCR_PROCESSING } from './ocr-queue.producer';
import { GoogleVisionService } from './providers/google-vision.service';
import { AwsTextractService } from './providers/aws-textract.service';
import { OcrJobEntity } from './entities/ocr-job.entity';
import { OcrScanEntity } from './entities/ocr-scan.entity';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { OcrAnalyticsController } from './ocr-analytics.controller';
import { OcrAnalyticsService } from './ocr-analytics.service';
import { EmailService } from '../../common/email/email.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OcrJobEntity, OcrScanEntity]),
    BullModule.registerQueue({ name: QUEUE_OCR_PROCESSING }),
    MulterModule.register({ storage: memoryStorage() }),
    TenantContextModule,
  ],
  controllers: [OcrController, OcrAnalyticsController],
  providers: [
    OcrService,
    OcrJobRepository,
    OcrScanRepository,
    OcrQueueProducer,
    OcrProcessor,
    GoogleVisionService,
    AwsTextractService,
    OcrAnalyticsService,
    EmailService,
  ],
  exports: [OcrService],
})
export class OcrModule {}
