import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';

export const QUEUE_OCR_PROCESSING = 'ocr-processing';

export interface OcrQueuePayload {
  jobId: string;
  tenantId: string;
  textractJobId: string;
  sessionToken: string;
  s3Bucket: string;
  s3Keys: string[];
}

@Injectable()
export class OcrQueueProducer {
  constructor(
    @InjectQueue(QUEUE_OCR_PROCESSING) private readonly ocrQueue: Queue,
  ) {}

  async enqueueTextractJob(payload: OcrQueuePayload): Promise<void> {
    await this.ocrQueue.add(payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }
}
