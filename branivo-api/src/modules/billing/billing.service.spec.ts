import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { getQueueToken } from '@nestjs/bull';
import {
  BillingService,
  BILLING_JOB_GENERATE_INVOICE,
  BILLING_JOB_RUN_ALL_TENANTS,
} from './billing.service';
import { BillingRepository } from './billing.repository';
import { EmailService } from '../../infrastructure/email/email.service';
import { Invoice } from './entities/invoice.entity';
import { QUEUE_BILLING } from '../../infrastructure/queues/queue.module';
import type { CreateInvoiceData } from './billing.repository';

const TENANT_UUID = 'aaaaaaaa-0000-0000-0000-000000000001';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-uuid',
    tenantId: TENANT_UUID,
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-01-31'),
    policiesCount: 5,
    totalPremium: 2250,
    platformFee: 112.5,
    subscriptionFee: 99,
    amountDue: 211.5,
    isProRata: false,
    daysActive: null,
    pdfUrl: null,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as Invoice;
}

const mockBillingRepo = {
  createInvoice: jest.fn(),
  findByTenantAndPeriod: jest.fn(),
  findByTenant: jest.fn(),
  updateStatus: jest.fn(),
  updatePdfUrl: jest.fn(),
};

const mockEmailService = {
  sendBillingFailureAlert: jest.fn(),
  sendInvoiceEmail: jest.fn().mockResolvedValue(undefined),
};

const mockConfig = {
  get: jest.fn().mockReturnValue('admin@branivo.com'),
};

const mockDataSource = {
  query: jest.fn(),
};

const mockBillingQueue = {
  add: jest.fn(),
};

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: BillingRepository, useValue: mockBillingRepo },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: DataSource, useValue: mockDataSource },
        { provide: getQueueToken(QUEUE_BILLING), useValue: mockBillingQueue },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  describe('generateInvoiceForTenant', () => {
    it('returns existing invoice when one exists (idempotency)', async () => {
      const existing = makeInvoice();
      mockBillingRepo.findByTenantAndPeriod.mockResolvedValue(existing);

      const result = await service.generateInvoiceForTenant(
        TENANT_UUID,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result).toBe(existing);
      expect(mockBillingRepo.createInvoice).not.toHaveBeenCalled();
    });

    it('generates invoice for a full-month active tenant (no pro-rata)', async () => {
      mockBillingRepo.findByTenantAndPeriod.mockResolvedValue(null);

      // Tenant activated 3 months ago (before period)
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: TENANT_UUID,
            name: 'Demo Broker',
            monthly_fee: '99.00',
            activated_at: new Date('2025-10-01'),
          },
        ])
        .mockResolvedValueOnce([
          {
            policies_count: '5',
            total_premium: '2250.00',
            platform_fee: '112.50',
          },
        ])
        // broker email query
        .mockResolvedValueOnce([{ email: 'broker@demo.com' }]);

      const created = makeInvoice();
      mockBillingRepo.createInvoice.mockResolvedValue(created);

      const result = await service.generateInvoiceForTenant(
        TENANT_UUID,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result).toBe(created);
      expect(mockBillingRepo.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_UUID,
          isProRata: false,
          daysActive: null,
          subscriptionFee: 99,
        }),
      );
    });

    it('applies pro-rata subscription fee for mid-month activation', async () => {
      mockBillingRepo.findByTenantAndPeriod.mockResolvedValue(null);

      // Tenant activated on Jan 16 — period Jan 1..31 (31 days)
      // daysActive = ceil((Jan31 - Jan16) / 86400000) + 1 = ceil(15) + 1 = 16
      // subscriptionFee = round2(99 * 16 / 31) = round2(51.096...) = 51.1
      const activatedAt = new Date('2026-01-16');
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: TENANT_UUID,
            name: 'Demo Broker',
            monthly_fee: '99.00',
            activated_at: activatedAt,
          },
        ])
        .mockResolvedValueOnce([
          {
            policies_count: '3',
            total_premium: '900.00',
            platform_fee: '45.00',
          },
        ])
        // broker email query
        .mockResolvedValueOnce([{ email: 'broker@demo.com' }]);

      const created = makeInvoice({ isProRata: true, daysActive: 16 });
      mockBillingRepo.createInvoice.mockResolvedValue(created);

      await service.generateInvoiceForTenant(
        TENANT_UUID,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      const callArg = (
        mockBillingRepo.createInvoice.mock
          .calls as unknown as CreateInvoiceData[][]
      )[0][0];
      expect(callArg.isProRata).toBe(true);
      expect(callArg.daysActive).toBe(16);
      expect(callArg.subscriptionFee).toBe(51.1); // round2(99 * 16 / 31)
    });

    it('throws when tenant is not found or not active', async () => {
      mockBillingRepo.findByTenantAndPeriod.mockResolvedValue(null);
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(
        service.generateInvoiceForTenant(
          TENANT_UUID,
          new Date('2026-01-01'),
          new Date('2026-01-31'),
        ),
      ).rejects.toThrow('not found or not active');
    });
  });

  describe('runManualBilling', () => {
    it('queues generate-invoice job for a specific tenant', async () => {
      await service.runManualBilling(TENANT_UUID);

      expect(mockBillingQueue.add).toHaveBeenCalledWith(
        BILLING_JOB_GENERATE_INVOICE,
        expect.objectContaining({ tenantId: TENANT_UUID }),
        expect.any(Object),
      );
    });

    it('queues run-all-tenants job when no tenantId is provided', async () => {
      await service.runManualBilling();

      expect(mockBillingQueue.add).toHaveBeenCalledWith(
        BILLING_JOB_RUN_ALL_TENANTS,
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('notifySuperAdminOnFailure', () => {
    it('sends billing failure alert email to super admin', async () => {
      mockEmailService.sendBillingFailureAlert.mockResolvedValue(undefined);

      await service.notifySuperAdminOnFailure(
        TENANT_UUID,
        new Error('DB connection failed'),
      );

      expect(mockEmailService.sendBillingFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_UUID,
          errorMessage: 'DB connection failed',
        }),
      );
    });

    it('does not throw if email sending fails', async () => {
      mockEmailService.sendBillingFailureAlert.mockRejectedValue(
        new Error('SMTP error'),
      );

      await expect(
        service.notifySuperAdminOnFailure(TENANT_UUID, new Error('Job failed')),
      ).resolves.not.toThrow();
    });
  });
});
