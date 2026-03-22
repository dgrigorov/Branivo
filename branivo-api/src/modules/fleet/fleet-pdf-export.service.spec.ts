/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { FleetPdfExportService } from './fleet-pdf-export.service';
import { FleetPdfExportRepository } from './fleet-pdf-export.repository';
import { PoliciesRepository } from '../policies/policies.repository';
import { PdfGenerationService } from '../policies/pdf-generation.service';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { QUEUE_PDF_GENERATION } from '../../infrastructure/queues/queue.module';
import {
  FleetPdfExport,
  FleetPdfExportStatus,
} from './entities/fleet-pdf-export.entity';
import type { BatchPdfJobPayload } from './fleet-pdf-export.types';

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const EXPORT_ID = 'cccccccc-0000-0000-0000-000000000003';
const POLICY_ID_1 = 'dddddddd-0000-0000-0000-000000000004';
const POLICY_ID_2 = 'eeeeeeee-0000-0000-0000-000000000005';

function makeExport(overrides: Partial<FleetPdfExport> = {}): FleetPdfExport {
  return {
    id: EXPORT_ID,
    tenantId: TENANT_ID,
    requestedBy: USER_ID,
    policyIds: [POLICY_ID_1, POLICY_ID_2],
    status: FleetPdfExportStatus.PROCESSING,
    totalCount: 2,
    completedCount: 0,
    failedCount: 0,
    failedPolicyIds: [],
    zipS3Key: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('FleetPdfExportService', () => {
  let service: FleetPdfExportService;
  let exportRepo: jest.Mocked<FleetPdfExportRepository>;
  let policiesRepo: jest.Mocked<PoliciesRepository>;
  let pdfGenerationService: jest.Mocked<PdfGenerationService>;
  let s3Service: jest.Mocked<S3Service>;
  let pdfQueue: { add: jest.Mock };

  beforeEach(async () => {
    exportRepo = {
      save: jest.fn().mockResolvedValue(makeExport()),
      findByIdAndTenant: jest.fn(),
      findByIdRaw: jest.fn(),
      incrementCompleted: jest.fn().mockResolvedValue(undefined),
      incrementFailed: jest.fn().mockResolvedValue(undefined),
      updateZipReady: jest.fn().mockResolvedValue(undefined),
      tryMarkForAssembly: jest.fn().mockResolvedValue(false),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<FleetPdfExportRepository>;

    policiesRepo = {
      findManyByIds: jest.fn(),
      findByIdWithoutScope: jest.fn(),
    } as unknown as jest.Mocked<PoliciesRepository>;

    pdfGenerationService = {
      generateAndUploadPolicyPdf: jest.fn(),
    } as unknown as jest.Mocked<PdfGenerationService>;

    s3Service = {
      generatePresignedUrl: jest.fn(),
      uploadPolicyDocument: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<S3Service>;

    const notificationsService = {
      notifyBroker: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<NotificationsService>;

    const tenantContext = {
      getTenantId: jest.fn().mockReturnValue(TENANT_ID),
    } as unknown as jest.Mocked<TenantContext>;

    pdfQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FleetPdfExportService,
        { provide: FleetPdfExportRepository, useValue: exportRepo },
        { provide: PoliciesRepository, useValue: policiesRepo },
        { provide: PdfGenerationService, useValue: pdfGenerationService },
        { provide: S3Service, useValue: s3Service },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: TenantContext, useValue: tenantContext },
        { provide: getQueueToken(QUEUE_PDF_GENERATION), useValue: pdfQueue },
      ],
    }).compile();

    service = module.get<FleetPdfExportService>(FleetPdfExportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createBatchExport ───────────────────────────────────────────────────────

  it('createBatchExport — policyIds from foreign tenant are filtered out (tenant isolation)', async () => {
    // Only POLICY_ID_1 belongs to tenant — POLICY_ID_2 is foreign
    policiesRepo.findManyByIds.mockResolvedValue([
      { id: POLICY_ID_1 },
    ] as Awaited<ReturnType<typeof policiesRepo.findManyByIds>>);
    exportRepo.save.mockResolvedValue(makeExport({ policyIds: [POLICY_ID_1] }));

    await service.createBatchExport([POLICY_ID_1, POLICY_ID_2], USER_ID);

    expect(policiesRepo.findManyByIds).toHaveBeenCalledWith(TENANT_ID, [
      POLICY_ID_1,
      POLICY_ID_2,
    ]);
    expect(pdfQueue.add).toHaveBeenCalledTimes(1);
    expect(pdfQueue.add).toHaveBeenCalledWith(
      'generate-batch-pdf',
      expect.objectContaining({ policyId: POLICY_ID_1 }),
      expect.any(Object),
    );
  });

  it('createBatchExport — queues one BullMQ job per valid policy', async () => {
    policiesRepo.findManyByIds.mockResolvedValue([
      { id: POLICY_ID_1 },
      { id: POLICY_ID_2 },
    ] as Awaited<ReturnType<typeof policiesRepo.findManyByIds>>);

    await service.createBatchExport([POLICY_ID_1, POLICY_ID_2], USER_ID);

    expect(pdfQueue.add).toHaveBeenCalledTimes(2);
  });

  // ─── getExportStatus ─────────────────────────────────────────────────────────

  it('getExportStatus — wrong tenantId (record not found) → BadRequestException', async () => {
    exportRepo.findByIdAndTenant.mockResolvedValue(null);

    await expect(service.getExportStatus(EXPORT_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ─── getDownloadUrl ──────────────────────────────────────────────────────────

  it('getDownloadUrl — status pending → BadRequestException', async () => {
    exportRepo.findByIdAndTenant.mockResolvedValue(
      makeExport({ status: FleetPdfExportStatus.PENDING }),
    );

    await expect(service.getDownloadUrl(EXPORT_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('getDownloadUrl — expiresAt in the past → 410 Gone', async () => {
    const pastDate = new Date(Date.now() - 60_000);
    exportRepo.findByIdAndTenant.mockResolvedValue(
      makeExport({
        status: FleetPdfExportStatus.COMPLETED,
        expiresAt: pastDate,
        zipS3Key: 'some/key.zip',
      }),
    );

    await expect(service.getDownloadUrl(EXPORT_ID)).rejects.toMatchObject({
      status: HttpStatus.GONE,
    });
  });

  it('getDownloadUrl — status completed and not expired → returns presigned URL', async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    exportRepo.findByIdAndTenant.mockResolvedValue(
      makeExport({
        status: FleetPdfExportStatus.COMPLETED,
        expiresAt: futureDate,
        zipS3Key: 'tenant/fleet/exports/id/policies.zip',
      }),
    );
    s3Service.generatePresignedUrl.mockResolvedValue('https://presigned-url');

    const result = await service.getDownloadUrl(EXPORT_ID);

    expect(s3Service.generatePresignedUrl).toHaveBeenCalledWith(
      'tenant/fleet/exports/id/policies.zip',
      900,
    );
    expect(result).toEqual({
      downloadUrl: 'https://presigned-url',
      expiresInSeconds: 900,
    });
  });

  // ─── processIndividualPdfJob ─────────────────────────────────────────────────

  it('processIndividualPdfJob — success → increments completedCount', async () => {
    const payload: BatchPdfJobPayload = {
      exportId: EXPORT_ID,
      policyId: POLICY_ID_1,
      tenantId: TENANT_ID,
    };
    pdfGenerationService.generateAndUploadPolicyPdf.mockResolvedValue(
      's3-key.pdf',
    );
    exportRepo.findByIdRaw.mockResolvedValue(
      makeExport({ completedCount: 1, totalCount: 2 }),
    );

    await service.processIndividualPdfJob(payload);

    expect(exportRepo.incrementCompleted).toHaveBeenCalledWith(EXPORT_ID);
  });

  it('processIndividualPdfJob — PDF generation failure → increments failedCount', async () => {
    const payload: BatchPdfJobPayload = {
      exportId: EXPORT_ID,
      policyId: POLICY_ID_1,
      tenantId: TENANT_ID,
    };
    pdfGenerationService.generateAndUploadPolicyPdf.mockRejectedValue(
      new Error('PDF generation timeout'),
    );
    exportRepo.findByIdRaw.mockResolvedValue(
      makeExport({ failedCount: 1, totalCount: 2 }),
    );

    await service.processIndividualPdfJob(payload);

    expect(exportRepo.incrementFailed).toHaveBeenCalledWith(EXPORT_ID, {
      policyId: POLICY_ID_1,
      error: 'PDF generation timeout',
    });
  });
});
