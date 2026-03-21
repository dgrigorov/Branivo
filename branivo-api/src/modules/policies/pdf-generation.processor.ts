import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { QUEUE_PDF_GENERATION } from '../../infrastructure/queues/queue.module';
import type { PdfGenerationJobPayload } from '../payments/stripe-webhook.service';
import { PdfGenerationService } from './pdf-generation.service';

@Processor(QUEUE_PDF_GENERATION)
export class PdfGenerationProcessor {
  private readonly logger = new Logger(PdfGenerationProcessor.name);

  constructor(private readonly pdfGenerationService: PdfGenerationService) {}

  @Process('generate-policy-pdf')
  async process(job: Job<PdfGenerationJobPayload>): Promise<void> {
    this.logger.log(`Processing PDF job for policy: ${job.data.policyId}`);
    await this.pdfGenerationService.generateAndDeliverDocuments(job.data);
  }
}
