/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PoliciesController } from './policies.controller';
import { PoliciesRepository } from './policies.repository';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { ShipmentsRepository } from '../logistics/shipments.repository';
import { Policy, PolicyStatus } from './entities/policy.entity';
import { Shipment } from '../logistics/entities/shipment.entity';
import { PoliciesService } from './policies.service';

const mockPolicyWithDocs: Partial<Policy> = {
  id: 'policy-id-1',
  tenantId: 'tenant-id-1',
  policyNumber: 'TEST-001',
  status: PolicyStatus.ACTIVE,
  policyPdfS3Key: 'tenant-id-1/2026/03/policy/policy-id-1.pdf',
  greenCardPdfS3Key: 'tenant-id-1/2026/03/green-card/policy-id-1.pdf',
};

const mockPolicyNoDocs: Partial<Policy> = {
  id: 'policy-id-2',
  tenantId: 'tenant-id-1',
  policyNumber: 'TEST-002',
  status: PolicyStatus.ACTIVE,
  policyPdfS3Key: undefined,
  greenCardPdfS3Key: undefined,
};

const mockPolicyForShipment: Partial<Policy> = {
  id: 'policy-id-3',
  tenantId: 'tenant-id-1',
  policyNumber: 'TEST-003',
  status: PolicyStatus.ACTIVE,
};

const mockShipment: Partial<Shipment> = {
  id: 'shipment-id-1',
  provider: 'speedy',
  trackingNumber: 'SPEEDY-ABC123',
  estimatedDeliveryDate: new Date('2026-03-25'),
  status: 'dispatched',
  createdAt: new Date('2026-03-22T10:00:00.000Z'),
};

describe('PoliciesController', () => {
  let controller: PoliciesController;
  let mockPoliciesRepo: jest.Mocked<PoliciesRepository>;
  let mockS3Service: jest.Mocked<S3Service>;
  let mockShipmentsRepo: jest.Mocked<ShipmentsRepository>;
  let mockPoliciesService: jest.Mocked<PoliciesService>;

  beforeEach(async () => {
    mockPoliciesRepo = {
      findByIdForTenant: jest.fn(),
    } as unknown as jest.Mocked<PoliciesRepository>;

    mockS3Service = {
      generatePresignedUrl: jest
        .fn()
        .mockResolvedValue('https://s3.example.com/signed-url'),
    } as unknown as jest.Mocked<S3Service>;

    mockShipmentsRepo = {
      findByPolicyIdForTenant: jest.fn(),
    } as unknown as jest.Mocked<ShipmentsRepository>;

    mockPoliciesService = {
      listPoliciesDetailed: jest.fn(),
      createPolicy: jest.fn(),
      getPolicyDetailedById: jest.fn(),
      updatePolicy: jest.fn(),
      deletePolicy: jest.fn(),
      findPolicyById: jest.fn(),
    } as unknown as jest.Mocked<PoliciesService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PoliciesController],
      providers: [
        { provide: PoliciesService, useValue: mockPoliciesService },
        { provide: PoliciesRepository, useValue: mockPoliciesRepo },
        { provide: S3Service, useValue: mockS3Service },
        { provide: ShipmentsRepository, useValue: mockShipmentsRepo },
      ],
    }).compile();

    controller = module.get<PoliciesController>(PoliciesController);
  });

  describe('GET /policies/:id/documents', () => {
    it('returns 200 with presigned URLs when documents exist', async () => {
      mockPoliciesRepo.findByIdForTenant.mockResolvedValue(
        mockPolicyWithDocs as Policy,
      );
      const result = await controller.getDocuments('policy-id-1');

      expect(result.policyPdfUrl).toBe('https://s3.example.com/signed-url');
      expect(result.greenCardUrl).toBe('https://s3.example.com/signed-url');
      expect(result.expiresAt).toBeDefined();
    });

    it('returns 404 when policyPdfS3Key is null', async () => {
      mockPoliciesRepo.findByIdForTenant.mockResolvedValue(
        mockPolicyNoDocs as Policy,
      );
      await expect(controller.getDocuments('policy-id-2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns 404 when policy is not found', async () => {
      mockPoliciesRepo.findByIdForTenant.mockResolvedValue(null);
      await expect(controller.getDocuments('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('calls generatePresignedUrl with 900s TTL for both documents', async () => {
      mockPoliciesRepo.findByIdForTenant.mockResolvedValue(
        mockPolicyWithDocs as Policy,
      );
      await controller.getDocuments('policy-id-1');

      expect(mockS3Service.generatePresignedUrl).toHaveBeenCalledWith(
        mockPolicyWithDocs.policyPdfS3Key,
        900,
      );
      expect(mockS3Service.generatePresignedUrl).toHaveBeenCalledWith(
        mockPolicyWithDocs.greenCardPdfS3Key,
        900,
      );
    });
  });

  describe('GET /policies/:id/shipment', () => {
    it('returns 200 with shipment data when shipment exists', async () => {
      mockPoliciesRepo.findByIdForTenant.mockResolvedValue(
        mockPolicyForShipment as Policy,
      );
      mockShipmentsRepo.findByPolicyIdForTenant.mockResolvedValue(
        mockShipment as Shipment,
      );

      const result = await controller.getShipment('policy-id-3');

      expect(result.shipmentId).toBe('shipment-id-1');
      expect(result.provider).toBe('speedy');
      expect(result.trackingNumber).toBe('SPEEDY-ABC123');
      expect(result.status).toBe('dispatched');
      expect(result.estimatedDeliveryDate).toBe('2026-03-25');
      expect(result.createdAt).toBeDefined();
    });

    it('returns 404 when no shipment exists for this policy', async () => {
      mockPoliciesRepo.findByIdForTenant.mockResolvedValue(
        mockPolicyForShipment as Policy,
      );
      mockShipmentsRepo.findByPolicyIdForTenant.mockResolvedValue(null);

      await expect(controller.getShipment('policy-id-3')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns 404 when policy is not found', async () => {
      mockPoliciesRepo.findByIdForTenant.mockResolvedValue(null);

      await expect(controller.getShipment('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
