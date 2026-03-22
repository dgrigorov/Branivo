import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { QUEUE_PDF_GENERATION } from '../../infrastructure/queues/queue.module';
import { FleetPdfExportService } from './fleet-pdf-export.service';
import type { BatchPdfJobPayload } from './fleet-pdf-export.types';
import { BATCH_PDF_JOB_NAME } from './fleet-pdf-export.types';

@Processor(QUEUE_PDF_GENERATION)
export class FleetPdfBatchProcessor {
  constructor(private readonly fleetPdfExportService: FleetPdfExportService) {}

  @Process(BATCH_PDF_JOB_NAME)
  async process(job: Job<BatchPdfJobPayload>): Promise<void> {
    await this.fleetPdfExportService.processIndividualPdfJob(job.data);
  }
}
