import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PassThrough } from 'stream';
import archiver from 'archiver';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { QUEUE_PDF_GENERATION } from '../../infrastructure/queues/queue.module';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PoliciesRepository } from '../policies/policies.repository';
import { PdfGenerationService } from '../policies/pdf-generation.service';
import { FleetPdfExportRepository } from './fleet-pdf-export.repository';
import {
  FleetPdfExport,
  FleetPdfExportStatus,
} from './entities/fleet-pdf-export.entity';
import type { BatchExportResponseDto } from './dto/batch-export-response.dto';
import type { BatchExportDownloadDto } from './dto/batch-export-download.dto';
import type { BatchPdfJobPayload } from './fleet-pdf-export.types';
import { BATCH_PDF_JOB_NAME } from './fleet-pdf-export.types';

@Injectable()
export class FleetPdfExportService {
  private readonly logger = new Logger(FleetPdfExportService.name);

  constructor(
    private readonly exportRepo: FleetPdfExportRepository,
    private readonly policiesRepo: PoliciesRepository,
    private readonly pdfGenerationService: PdfGenerationService,
    private readonly s3Service: S3Service,
    private readonly notificationsService: NotificationsService,
    private readonly tenantContext: TenantContext,
    @InjectQueue(QUEUE_PDF_GENERATION) private readonly pdfQueue: Queue,
  ) {}

  async createBatchExport(
    policyIds: string[],
    requestedBy: string,
  ): Promise<BatchExportResponseDto> {
    const tenantId = this.tenantContext.getTenantId();
    const userId = requestedBy;

    const validPolicies = await this.policiesRepo.findManyByIds(
      tenantId,
      policyIds,
    );
    const validPolicyIds = validPolicies.map((p) => p.id);

    const exportRecord = await this.exportRepo.save({
      tenantId,
      requestedBy: userId,
      policyIds: validPolicyIds,
      status: FleetPdfExportStatus.PENDING,
      totalCount: validPolicyIds.length,
      completedCount: 0,
      failedCount: 0,
      failedPolicyIds: [],
      zipS3Key: null,
      expiresAt: null,
    } as Partial<FleetPdfExport>);

    await Promise.all(
      validPolicyIds.map((policyId) =>
        this.pdfQueue.add(
          BATCH_PDF_JOB_NAME,
          {
            exportId: exportRecord.id,
            policyId,
            tenantId,
          } satisfies BatchPdfJobPayload,
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            jobId: `batch-pdf-${exportRecord.id}-${policyId}`,
          },
        ),
      ),
    );

    await this.exportRepo.updateStatus(
      exportRecord.id,
      FleetPdfExportStatus.PROCESSING,
    );

    return this.toResponseDto({
      ...exportRecord,
      status: FleetPdfExportStatus.PROCESSING,
    });
  }

  async getExportStatus(exportId: string): Promise<BatchExportResponseDto> {
    const tenantId = this.tenantContext.getTenantId();
    const record = await this.exportRepo.findByIdAndTenant(exportId, tenantId);
    if (!record) {
      throw new BadRequestException('Export not found');
    }
    return this.toResponseDto(record);
  }

  async getDownloadUrl(exportId: string): Promise<BatchExportDownloadDto> {
    const tenantId = this.tenantContext.getTenantId();
    const record = await this.exportRepo.findByIdAndTenant(exportId, tenantId);
    if (!record) {
      throw new BadRequestException('Export not found');
    }

    const readyStatuses: FleetPdfExportStatus[] = [
      FleetPdfExportStatus.COMPLETED,
      FleetPdfExportStatus.PARTIAL,
    ];
    if (!readyStatuses.includes(record.status)) {
      throw new BadRequestException('Export not ready');
    }

    if (record.expiresAt && record.expiresAt < new Date()) {
      throw new HttpException(
        'Export has expired. Please generate a new batch export.',
        HttpStatus.GONE,
      );
    }

    const downloadUrl = await this.s3Service.generatePresignedUrl(
      record.zipS3Key!,
      900,
    );
    return { downloadUrl, expiresInSeconds: 900 };
  }

  async processIndividualPdfJob(payload: BatchPdfJobPayload): Promise<void> {
    const { exportId, policyId, tenantId } = payload;
    try {
      await this.pdfGenerationService.generateAndUploadPolicyPdf(
        policyId,
        tenantId,
      );
      await this.markPolicyPdfComplete(exportId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Batch PDF failed for policy ${policyId}: ${message}`);
      await this.markPolicyPdfFailed(exportId, policyId, message);
    }
  }

  async markPolicyPdfComplete(exportId: string): Promise<void> {
    await this.exportRepo.incrementCompleted(exportId);
    await this.tryAssemble(exportId);
  }

  async markPolicyPdfFailed(
    exportId: string,
    policyId: string,
    error: string,
  ): Promise<void> {
    await this.exportRepo.incrementFailed(exportId, { policyId, error });
    await this.tryAssemble(exportId);
  }

  private async tryAssemble(exportId: string): Promise<void> {
    const record = await this.exportRepo.findByIdRaw(exportId);
    if (!record) return;

    const shouldAssemble = await this.exportRepo.tryMarkForAssembly(
      exportId,
      record.totalCount,
    );
    if (shouldAssemble) {
      await this.assembleBatchZip(exportId);
    }
  }

  private async assembleBatchZip(exportId: string): Promise<void> {
    const record = await this.exportRepo.findByIdRaw(exportId);
    if (!record) return;

    if (record.completedCount === 0) {
      await this.exportRepo.updateStatus(exportId, FleetPdfExportStatus.FAILED);
      await this.notificationsService.notifyBroker({
        tenantId: record.tenantId,
        subject: 'Fleet PDF Export Failed',
        message: `All ${record.totalCount} PDFs failed to generate. Export ID: ${exportId}`,
      });
      return;
    }

    const failedIds = new Set(record.failedPolicyIds.map((f) => f.policyId));
    const completedPolicyIds = record.policyIds.filter(
      (id) => !failedIds.has(id),
    );

    const pdfBuffers = await Promise.all(
      completedPolicyIds.map(async (policyId) => {
        const policy = await this.policiesRepo.findByIdWithoutScope(policyId);
        if (!policy?.policyPdfS3Key) return null;
        const buffer = await this.downloadFromS3(policy.policyPdfS3Key);
        return { policyId, buffer };
      }),
    );

    const validBuffers = pdfBuffers.filter(
      (b): b is { policyId: string; buffer: Buffer } => b !== null,
    );

    const zipBuffer = await this.buildZipBuffer(validBuffers);

    const zipS3Key = `${record.tenantId}/fleet/exports/${exportId}/policies.zip`;
    await this.s3Service.uploadPolicyDocument(zipS3Key, zipBuffer);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const finalStatus =
      record.completedCount === record.totalCount
        ? FleetPdfExportStatus.COMPLETED
        : FleetPdfExportStatus.PARTIAL;

    await this.exportRepo.updateZipReady(
      exportId,
      zipS3Key,
      expiresAt,
      finalStatus,
    );

    await this.notificationsService.notifyBroker({
      tenantId: record.tenantId,
      subject: 'Fleet PDF Export Ready',
      message: `Your batch PDF export is ready. ${record.failedCount > 0 ? `${record.failedCount} PDFs failed.` : 'All PDFs generated successfully.'} Export ID: ${exportId}`,
    });
  }

  private async downloadFromS3(s3Key: string): Promise<Buffer> {
    const url = await this.s3Service.generatePresignedUrl(s3Key, 300);
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private buildZipBuffer(
    pdfs: { policyId: string; buffer: Buffer }[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const passThrough = new PassThrough();
      const chunks: Buffer[] = [];
      passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));
      passThrough.on('end', () => resolve(Buffer.concat(chunks)));
      passThrough.on('error', reject);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(passThrough);
      archive.on('error', reject);

      for (const { policyId, buffer } of pdfs) {
        archive.append(buffer, { name: `policy-${policyId}.pdf` });
      }

      void archive.finalize();
    });
  }

  private toResponseDto(record: FleetPdfExport): BatchExportResponseDto {
    return {
      exportId: record.id,
      status: record.status,
      totalCount: record.totalCount,
      completedCount: record.completedCount,
      failedCount: record.failedCount,
      failedPolicyIds: record.failedPolicyIds,
      zipS3Key: record.zipS3Key,
      expiresAt: record.expiresAt,
    };
  }
}
