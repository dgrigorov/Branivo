import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { QUEUE_OCR_PROCESSING, OcrQueuePayload } from './ocr-queue.producer';
import { OcrJobRepository } from './ocr-job.repository';
import { AwsTextractService } from './providers/aws-textract.service';
import { OcrService } from './ocr.service';
import { OcrField, OcrJobStatus, OcrProvider } from './entities/ocr-job.entity';

@Processor(QUEUE_OCR_PROCESSING)
export class OcrProcessor {
  private readonly logger = new Logger(OcrProcessor.name);

  constructor(
    private readonly ocrJobRepository: OcrJobRepository,
    private readonly awsTextractService: AwsTextractService,
    private readonly ocrService: OcrService,
  ) {}

  @Process()
  async process(job: Job<OcrQueuePayload>): Promise<void> {
    const { jobId, textractJobId, sessionToken, tenantId } = job.data;

    this.logger.log(
      `Processing Textract job ${textractJobId} for OCR job ${jobId}`,
    );

    try {
      const result = await this.awsTextractService.getResults(textractJobId);

      await this.ocrJobRepository.updateStatus(jobId, OcrJobStatus.COMPLETED, {
        result,
        confidenceScores: Object.fromEntries(
          Object.entries(result).map(
            ([k, v]: [string, OcrField | undefined]) =>
              [k, v?.confidence ?? 0] as [string, number],
          ),
        ),
        provider: OcrProvider.AWS_TEXTRACT,
      });

      await this.ocrService.updateAnonymousSession(
        sessionToken,
        tenantId,
        result,
        jobId,
      );

      this.logger.log(`OCR job ${jobId} completed via Textract`);
    } catch (err) {
      this.logger.error(`OCR job ${jobId} failed via Textract`, err);
      await this.ocrJobRepository.updateStatus(jobId, OcrJobStatus.FAILED, {
        errorMessage:
          err instanceof Error ? err.message : 'Textract processing failed',
      });
      throw err; // rethrow so BullMQ can retry
    }
  }
}
