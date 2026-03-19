import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { OcrJobRepository } from './ocr-job.repository';
import { OcrProcessor } from './ocr.processor';
import { OcrQueueProducer, QUEUE_OCR_PROCESSING } from './ocr-queue.producer';
import { GoogleVisionService } from './providers/google-vision.service';
import { AwsTextractService } from './providers/aws-textract.service';
import { OcrJobEntity } from './entities/ocr-job.entity';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OcrJobEntity]),
    BullModule.registerQueue({ name: QUEUE_OCR_PROCESSING }),
    MulterModule.register({ storage: memoryStorage() }),
    TenantContextModule,
  ],
  controllers: [OcrController],
  providers: [
    OcrService,
    OcrJobRepository,
    OcrQueueProducer,
    OcrProcessor,
    GoogleVisionService,
    AwsTextractService,
  ],
  exports: [OcrService],
})
export class OcrModule {}
