/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PoliciesController } from './policies.controller';
import { PoliciesRepository } from './policies.repository';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { Policy, PolicyStatus } from './entities/policy.entity';

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

describe('PoliciesController', () => {
  let controller: PoliciesController;
  let mockPoliciesRepo: jest.Mocked<PoliciesRepository>;
  let mockS3Service: jest.Mocked<S3Service>;

  beforeEach(async () => {
    mockPoliciesRepo = {
      findByIdForTenant: jest.fn(),
    } as unknown as jest.Mocked<PoliciesRepository>;

    mockS3Service = {
      generatePresignedUrl: jest
        .fn()
        .mockResolvedValue('https://s3.example.com/signed-url'),
    } as unknown as jest.Mocked<S3Service>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PoliciesController],
      providers: [
        { provide: PoliciesRepository, useValue: mockPoliciesRepo },
        { provide: S3Service, useValue: mockS3Service },
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
});
