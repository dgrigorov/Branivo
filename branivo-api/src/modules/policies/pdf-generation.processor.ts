import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { QUEUE_PDF_GENERATION } from '../../infrastructure/queues/queue.module';
import type { PdfGenerationJobPayload } from '../payments/stripe-webhook.service';

@Processor(QUEUE_PDF_GENERATION)
export class PdfGenerationProcessor {
  private readonly logger = new Logger(PdfGenerationProcessor.name);

  @Process('generate-policy-pdf')
  process(job: Job<PdfGenerationJobPayload>): void {
    const { policyId, tenantId } = job.data;
    // TODO (Story 4.4): Имплементирай PDF генериране
    this.logger.log(
      `PDF generation queued for policy: ${policyId}, tenant: ${tenantId}`,
    );
    // Placeholder — не fail-ва, но не прави нищо
  }
}
