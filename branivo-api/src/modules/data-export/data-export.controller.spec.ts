import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { QUEUE_DATA_EXPORT } from '../../infrastructure/queues/queue.module';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';
import { DataExportRepository } from './data-export.repository';
import {
  DataExportRequest,
  DataExportStatus,
} from './entities/data-export-request.entity';
import { EmailService } from '../../infrastructure/email/email.service';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { EndClientRepository } from '../clients/repositories/end-client.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

const TENANT_ID = 'tenant-uuid';
const CUSTOMER_ID = 'customer-uuid';
const REQUEST_ID = 'req-uuid';

const mockUser: AuthenticatedUser = {
  userId: CUSTOMER_ID,
  tenantId: TENANT_ID,
  role: 'end_client',
  jti: 'jti-uuid',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

function makeRequest(
  overrides: Partial<DataExportRequest> = {},
): DataExportRequest {
  return {
    id: REQUEST_ID,
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    status: DataExportStatus.PENDING,
    s3Key: null,
    expiresAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

const mockDataExportRepo = {
  findLatestForCustomer: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
  markCompleted: jest.fn(),
};

const mockDataExportQueue = { add: jest.fn() };
const mockEmailService = { sendDataExportRequestedEmail: jest.fn() };
const mockS3Service = { generatePresignedUrl: jest.fn() };
const mockEndClientRepo = { findById: jest.fn() };
const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

describe('DataExportController', () => {
  let controller: DataExportController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContext.getTenantId.mockReturnValue(TENANT_ID);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataExportController],
      providers: [
        DataExportService,
        { provide: DataExportRepository, useValue: mockDataExportRepo },
        {
          provide: getQueueToken(QUEUE_DATA_EXPORT),
          useValue: mockDataExportQueue,
        },
        { provide: EmailService, useValue: mockEmailService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: EndClientRepository, useValue: mockEndClientRepo },
        { provide: TenantContext, useValue: mockTenantContext },
      ],
    }).compile();

    controller = module.get<DataExportController>(DataExportController);
  });

  describe('POST /clients/me/data-export', () => {
    it('should return { requestId } on success (HTTP 202)', async () => {
      mockDataExportRepo.findLatestForCustomer.mockResolvedValue(null);
      mockDataExportRepo.create.mockResolvedValue(makeRequest());
      mockEndClientRepo.findById.mockResolvedValue({
        id: CUSTOMER_ID,
        email: 'client@example.com',
      });
      mockEmailService.sendDataExportRequestedEmail.mockResolvedValue(
        undefined,
      );
      mockDataExportQueue.add.mockResolvedValue({});

      const result = await controller.requestExport(mockUser);

      expect(result.requestId).toBe(REQUEST_ID);
      expect(result.message).toContain('data export');
    });

    it('should propagate 429 when second request within 24 hours', async () => {
      const recentRequest = makeRequest({
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      });
      mockDataExportRepo.findLatestForCustomer.mockResolvedValue(recentRequest);

      await expect(controller.requestExport(mockUser)).rejects.toThrow(
        new HttpException(
          'Можете да поискате само 1 data export на 24 часа.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });
  });

  describe('GET /clients/me/data-export/status', () => {
    it('should return status pending', async () => {
      mockDataExportRepo.findLatestForCustomer.mockResolvedValue(makeRequest());

      const result = await controller.getStatus(mockUser);

      expect(result.status).toBe(DataExportStatus.PENDING);
    });

    it('should return 404 when no export request exists', async () => {
      mockDataExportRepo.findLatestForCustomer.mockResolvedValue(null);

      await expect(controller.getStatus(mockUser)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });
});
