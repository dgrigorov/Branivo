/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { PdfGenerationService } from './pdf-generation.service';
import { PoliciesRepository } from './policies.repository';
import { PolicyEventsRepository } from './policy-events.repository';
import { Policy, PolicyStatus } from './entities/policy.entity';
import { PolicyEventType } from './entities/policy-event.entity';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { EmailService } from '../../infrastructure/email/email.service';
import { EndClient } from '../clients/entities/end-client.entity';
import { Insurer } from '../quotes/entities/insurer.entity';
import type { PdfGenerationJobPayload } from '../payments/stripe-webhook.service';

const mockPolicy: Policy = {
  id: 'policy-id-1',
  tenantId: 'tenant-id-1',
  paymentId: 'payment-id-1',
  quoteId: 'quote-id-1',
  endClientId: 'client-id-1',
  insurerId: 'insurer-id-1',
  policyNumber: 'TEST-001',
  status: PolicyStatus.ACTIVE,
  stripePaymentIntentId: 'pi_test_1',
  premiumAmount: 500,
  commissionAmount: 25,
  commissionPct: 0.05,
  currency: 'BGN',
  coverageStartDate: new Date('2026-01-01'),
  coverageEndDate: new Date('2026-12-31'),
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  policyPdfS3Key: undefined,
  greenCardPdfS3Key: undefined,
  documentsEmailedAt: undefined,
};

const mockInsurer = { id: 'insurer-id-1', name: 'Allianz Bulgaria' } as Insurer;

const payload: PdfGenerationJobPayload = {
  policyId: 'policy-id-1',
  tenantId: 'tenant-id-1',
  quoteId: 'quote-id-1',
  endClientId: 'client-id-1',
};

describe('PdfGenerationService', () => {
  let service: PdfGenerationService;
  let mockPoliciesRepo: jest.Mocked<PoliciesRepository>;
  let mockEventsRepo: jest.Mocked<PolicyEventsRepository>;
  let mockS3Service: jest.Mocked<S3Service>;
  let mockEmailService: jest.Mocked<EmailService>;
  let mockPolicyRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    mockPoliciesRepo = {
      updatePdfKeys: jest.fn().mockResolvedValue(undefined),
      markDocumentsEmailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PoliciesRepository>;

    mockEventsRepo = {
      createEvent: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<PolicyEventsRepository>;

    mockS3Service = {
      uploadPolicyDocument: jest.fn().mockResolvedValue(undefined),
      generatePresignedUrl: jest
        .fn()
        .mockResolvedValue('https://s3.example.com/signed-url'),
    } as unknown as jest.Mocked<S3Service>;

    mockEmailService = {
      sendPolicyDocuments: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailService>;

    mockPolicyRepository = {
      findOne: jest.fn().mockResolvedValue(mockPolicy),
    };

    const endClientWithEmail = {
      id: 'client-id-1',
      email: 'client@example.com',
    } as EndClient & { email: string };
    const mockEndClientRepo = {
      findOne: jest.fn().mockResolvedValue(endClientWithEmail),
    };
    const mockInsurerRepo = {
      findOne: jest.fn().mockResolvedValue(mockInsurer),
    };

    const mockDataSource = {
      getRepository: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === EndClient) return mockEndClientRepo;
        if (entity === Insurer) return mockInsurerRepo;
        return { findOne: jest.fn().mockResolvedValue(null) };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfGenerationService,
        { provide: getRepositoryToken(Policy), useValue: mockPolicyRepository },
        { provide: PoliciesRepository, useValue: mockPoliciesRepo },
        { provide: PolicyEventsRepository, useValue: mockEventsRepo },
        { provide: S3Service, useValue: mockS3Service },
        { provide: EmailService, useValue: mockEmailService },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<PdfGenerationService>(PdfGenerationService);
  });

  it('calls S3Service.uploadPolicyDocument twice (policy PDF and green card)', async () => {
    await service.generateAndDeliverDocuments(payload);
    expect(mockS3Service.uploadPolicyDocument).toHaveBeenCalledTimes(2);
  });

  it('calls EmailService.sendPolicyDocuments with presigned URLs when email is available', async () => {
    await service.generateAndDeliverDocuments(payload);
    expect(mockEmailService.sendPolicyDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        policyNumber: 'TEST-001',
        policyPdfUrl: 'https://s3.example.com/signed-url',
        greenCardUrl: 'https://s3.example.com/signed-url',
      }),
    );
  });

  it('updates policy record with S3 keys', async () => {
    await service.generateAndDeliverDocuments(payload);
    expect(mockPoliciesRepo.updatePdfKeys).toHaveBeenCalledWith(
      'policy-id-1',
      expect.stringContaining('/policy/policy-id-1.pdf'),
      expect.stringContaining('/green-card/policy-id-1.pdf'),
    );
  });

  it('creates immutable policy_events record with DOCUMENTS_DELIVERED type', async () => {
    await service.generateAndDeliverDocuments(payload);
    expect(mockEventsRepo.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-id-1',
        policyId: 'policy-id-1',
        eventType: PolicyEventType.DOCUMENTS_DELIVERED,
      }),
    );
  });

  it('S3 key follows structure {tenantId}/{year}/{month}/policy/{policyId}.pdf', async () => {
    await service.generateAndDeliverDocuments(payload);
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const expectedKey = `tenant-id-1/${year}/${month}/policy/policy-id-1.pdf`;
    expect(mockS3Service.uploadPolicyDocument).toHaveBeenCalledWith(
      expectedKey,
      expect.any(Buffer),
    );
  });

  it('skips email when endClientId is not present', async () => {
    const noClientPayload: PdfGenerationJobPayload = {
      ...payload,
      endClientId: undefined,
    };
    await service.generateAndDeliverDocuments(noClientPayload);
    expect(mockEmailService.sendPolicyDocuments).not.toHaveBeenCalled();
  });

  it('throws error when policy is not found', async () => {
    mockPolicyRepository.findOne.mockResolvedValue(null);
    await expect(service.generateAndDeliverDocuments(payload)).rejects.toThrow(
      'Policy not found: policy-id-1',
    );
  });
});
