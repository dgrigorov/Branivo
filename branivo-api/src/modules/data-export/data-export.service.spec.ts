import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { QUEUE_DATA_EXPORT } from '../../infrastructure/queues/queue.module';
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

const TENANT_ID = 'tenant-uuid';
const CUSTOMER_ID = 'customer-uuid';
const REQUEST_ID = 'request-uuid';

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
  findById: jest.fn(),
  updateStatus: jest.fn(),
  markCompleted: jest.fn(),
};

const mockDataExportQueue = {
  add: jest.fn(),
};

const mockEmailService = {
  sendDataExportRequestedEmail: jest.fn(),
};

const mockS3Service = {
  generatePresignedUrl: jest.fn(),
};

const mockEndClientRepo = {
  findById: jest.fn(),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

describe('DataExportService', () => {
  let service: DataExportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContext.getTenantId.mockReturnValue(TENANT_ID);

    const module: TestingModule = await Test.createTestingModule({
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

    service = module.get<DataExportService>(DataExportService);
  });

  describe('requestExport', () => {
    it('should throw 429 when a request was made less than 24 hours ago', async () => {
      const createdAt = new Date(Date.now() - 23 * 60 * 60 * 1000);
      mockDataExportRepo.findLatestForCustomer.mockResolvedValue(
        makeRequest({ createdAt }),
      );

      await expect(service.requestExport(CUSTOMER_ID)).rejects.toThrow(
        new HttpException(
          'Можете да поискате само 1 data export на 24 часа.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });

    it('should queue job and send confirmation email on success', async () => {
      const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      mockDataExportRepo.findLatestForCustomer.mockResolvedValue(
        makeRequest({ createdAt }),
      );
      mockDataExportRepo.create.mockResolvedValue(makeRequest());
      mockEndClientRepo.findById.mockResolvedValue({
        id: CUSTOMER_ID,
        email: 'client@example.com',
      });
      mockEmailService.sendDataExportRequestedEmail.mockResolvedValue(
        undefined,
      );
      mockDataExportQueue.add.mockResolvedValue({});

      const result = await service.requestExport(CUSTOMER_ID);

      expect(mockDataExportRepo.create).toHaveBeenCalledWith(
        CUSTOMER_ID,
        TENANT_ID,
      );
      expect(mockDataExportQueue.add).toHaveBeenCalledWith(
        'data-export:process',
        {
          requestId: REQUEST_ID,
          customerId: CUSTOMER_ID,
          tenantId: TENANT_ID,
        },
      );
      expect(
        mockEmailService.sendDataExportRequestedEmail,
      ).toHaveBeenCalledWith({
        to: 'client@example.com',
        tenantId: TENANT_ID,
      });
      expect(result.requestId).toBe(REQUEST_ID);
    });

    it('should succeed even when customer has no email', async () => {
      mockDataExportRepo.findLatestForCustomer.mockResolvedValue(null);
      mockDataExportRepo.create.mockResolvedValue(makeRequest());
      mockEndClientRepo.findById.mockResolvedValue({
        id: CUSTOMER_ID,
        email: null,
      });
      mockDataExportQueue.add.mockResolvedValue({});

      const result = await service.requestExport(CUSTOMER_ID);

      expect(
        mockEmailService.sendDataExportRequestedEmail,
      ).not.toHaveBeenCalled();
      expect(result.requestId).toBe(REQUEST_ID);
    });
  });

  describe('getStatus', () => {
    it('should throw NotFoundException when no request exists', async () => {
      mockDataExportRepo.findLatestForCustomer.mockResolvedValue(null);

      await expect(service.getStatus(CUSTOMER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should generate downloadUrl when status is completed and not expired', async () => {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      mockDataExportRepo.findLatestForCustomer.mockResolvedValue(
        makeRequest({
          status: DataExportStatus.COMPLETED,
          s3Key: 'exports/tenant/customer/request.zip',
          expiresAt,
        }),
      );
      mockS3Service.generatePresignedUrl.mockResolvedValue(
        'https://signed-url',
      );

      const result = await service.getStatus(CUSTOMER_ID);

      expect(result.status).toBe(DataExportStatus.COMPLETED);
      expect(result.downloadUrl).toBe('https://signed-url');
      expect(result.expiresAt).toBe(expiresAt);
      expect(mockS3Service.generatePresignedUrl).toHaveBeenCalledWith(
        'exports/tenant/customer/request.zip',
        48 * 3600,
      );
    });

    it('should not include downloadUrl when status is pending', async () => {
      mockDataExportRepo.findLatestForCustomer.mockResolvedValue(makeRequest());

      const result = await service.getStatus(CUSTOMER_ID);

      expect(result.status).toBe(DataExportStatus.PENDING);
      expect(result.downloadUrl).toBeUndefined();
    });
  });
});
