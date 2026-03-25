import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { QUEUE_DATA_EXPORT } from '../../infrastructure/queues/queue.module';
import { EmailService } from '../../infrastructure/email/email.service';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { EndClientRepository } from '../clients/repositories/end-client.repository';
import { DataExportRepository } from './data-export.repository';
import { DataAggregatorService } from './data-aggregator.service';
import { DataExportStatus } from './entities/data-export-request.entity';
import type { DataExportJobData } from './data-export.service';

@Processor(QUEUE_DATA_EXPORT)
export class DataExportProcessor {
  private readonly logger = new Logger(DataExportProcessor.name);

  constructor(
    private readonly dataExportRepository: DataExportRepository,
    private readonly dataAggregatorService: DataAggregatorService,
    private readonly s3Service: S3Service,
    private readonly emailService: EmailService,
    private readonly endClientRepo: EndClientRepository,
  ) {}

  @Process('data-export:process')
  async handleExport(job: Job<DataExportJobData>): Promise<void> {
    const { requestId, customerId, tenantId } = job.data;
    this.logger.log(
      `Processing data export for requestId: ${requestId}, attempt: ${job.attemptsMade + 1}`,
    );

    await this.dataExportRepository.updateStatus(
      requestId,
      DataExportStatus.PROCESSING,
    );

    const zipBuffer = await this.dataAggregatorService.buildExportZip(
      customerId,
      tenantId,
    );

    const s3Key = `exports/${tenantId}/${customerId}/${requestId}.zip`;
    await this.s3Service.uploadExportArchive(s3Key, zipBuffer);

    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
    await this.dataExportRepository.markCompleted(requestId, s3Key, expiresAt);

    const signedUrl = await this.s3Service.generatePresignedUrl(
      s3Key,
      48 * 3600,
    );

    const customer = await this.endClientRepo.findById(customerId);
    if (customer?.email) {
      await this.emailService.sendDataExportReadyEmail({
        to: customer.email,
        downloadUrl: signedUrl,
        expiresAt,
        tenantId,
      });
    } else {
      this.logger.warn(
        `DataExport: customer ${customerId} has no email — skip ready notification`,
      );
    }

    this.logger.log(`DataExport completed for requestId: ${requestId}`);
  }

  @OnQueueFailed()
  async onFailed(job: Job<DataExportJobData>, error: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 3;
    if (job.attemptsMade >= maxAttempts) {
      this.logger.error(
        `[DLQ] DataExport failed for requestId: ${job.data.requestId}`,
        error.stack,
      );
      await this.dataExportRepository.updateStatus(
        job.data.requestId,
        DataExportStatus.FAILED,
      );
    } else {
      this.logger.warn(
        `DataExport job failed (attempt ${job.attemptsMade}/${maxAttempts}), will retry: ${job.data.requestId}`,
      );
    }
  }
}
