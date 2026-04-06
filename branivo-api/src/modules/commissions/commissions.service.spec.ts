import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CommissionsService } from './commissions.service';
import { AuditService } from '../../common/audit/audit.service';
import { CommissionsRepository } from './commissions.repository';
import { CommissionMatrix } from './entities/commission-matrix.entity';
import { ProductType } from './enums/product-type.enum';
import { UpsertCommissionRateDto } from './dto/upsert-commission-rate.dto';
import type { CommissionDashboardQueryDto } from './dto/commission-dashboard.dto';
import type { DashboardRawRow } from './commissions.repository';

const mockRepo = {
  findByInsurerAndProduct: jest.fn(),
  findAll: jest.fn(),
  upsert: jest.fn(),
  createPendingEvent: jest.fn(),
  confirmPendingEvent: jest.fn(),
  failPendingEvent: jest.fn(),
  getDashboardData: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockReturnValue('0.05'),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

describe('CommissionsService', () => {
  let service: CommissionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommissionsService,
        { provide: CommissionsRepository, useValue: mockRepo },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<CommissionsService>(CommissionsService);
  });

  describe('getRate', () => {
    it('returns rate from commission_matrix when entry exists', async () => {
      const entry = {
        ratePct: 0.045,
        insurer: { name: 'Allianz' },
      } as unknown as CommissionMatrix;
      mockRepo.findByInsurerAndProduct.mockResolvedValue(entry);

      const rate = await service.getRate('insurer-uuid', 'GO');

      expect(rate).toBe(0.045);
      expect(mockRepo.findByInsurerAndProduct).toHaveBeenCalledWith(
        'insurer-uuid',
        'GO',
      );
    });

    it('falls back to PLATFORM_FEE_PCT when no entry exists', async () => {
      mockRepo.findByInsurerAndProduct.mockResolvedValue(null);
      mockConfig.get.mockReturnValue('0.03');

      const rate = await service.getRate('insurer-uuid', 'KASKO');

      expect(rate).toBe(0.03);
    });

    it('uses default 0.05 when PLATFORM_FEE_PCT is not configured', async () => {
      mockRepo.findByInsurerAndProduct.mockResolvedValue(null);
      mockConfig.get.mockReturnValue(undefined);

      const rate = await service.getRate('insurer-uuid', 'GO');

      expect(rate).toBe(0.05);
    });
  });

  describe('upsertRate', () => {
    const dto: UpsertCommissionRateDto = {
      productType: ProductType.GO,
      ratePct: 0.06,
    };

    const mockEntry: CommissionMatrix = {
      id: 'entry-uuid',
      insurerId: 'insurer-uuid',
      productType: ProductType.GO,
      ratePct: 0.06,
      createdBy: 'user-uuid',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      insurer: {
        id: 'insurer-uuid',
        name: 'Allianz Bulgaria',
      } as CommissionMatrix['insurer'],
    };

    it('calls upsert on repository and writes to audit_log', async () => {
      mockRepo.findByInsurerAndProduct.mockResolvedValueOnce({ ratePct: 0.05 });
      mockRepo.upsert.mockResolvedValue(mockEntry);

      await service.upsertRate('insurer-uuid', dto, 'user-uuid');

      expect(mockRepo.upsert).toHaveBeenCalledWith({
        insurerId: 'insurer-uuid',
        productType: ProductType.GO,
        ratePct: 0.06,
        createdBy: 'user-uuid',
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: '00000000-0000-0000-0000-000000000000',
          userId: 'user-uuid',
          action: 'commission_matrix.updated',
          entityType: 'commission_matrix',
          entityId: 'entry-uuid',
        }),
      );
    });

    it('records old_rate and new_rate in audit log metadata', async () => {
      mockRepo.findByInsurerAndProduct.mockResolvedValueOnce({ ratePct: 0.05 });
      mockRepo.upsert.mockResolvedValue(mockEntry);

      await service.upsertRate('insurer-uuid', dto, 'user-uuid');

      const logCall = mockAuditService.log.mock.calls[0] as [
        { metadata: { old_rate: number; new_rate: number } },
      ];
      expect(logCall[0].metadata.old_rate).toBe(0.05);
      expect(logCall[0].metadata.new_rate).toBe(0.06);
    });

    it('records null old_rate when no prior entry exists', async () => {
      mockRepo.findByInsurerAndProduct.mockResolvedValueOnce(null);
      mockRepo.upsert.mockResolvedValue(mockEntry);

      await service.upsertRate('insurer-uuid', dto, null);

      const logCall = mockAuditService.log.mock.calls[0] as [
        { metadata: { old_rate: number | null } },
      ];
      expect(logCall[0].metadata.old_rate).toBeNull();
    });
  });

  describe('listMatrix', () => {
    it('returns mapped entries with insurer name', async () => {
      const entries: CommissionMatrix[] = [
        {
          id: 'e1',
          insurerId: 'i1',
          productType: ProductType.GO,
          ratePct: 0.05,
          createdBy: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
          insurer: { name: 'Allianz Bulgaria' } as CommissionMatrix['insurer'],
        },
      ];
      mockRepo.findAll.mockResolvedValue(entries);

      const result = await service.listMatrix();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        insurerId: 'i1',
        insurerName: 'Allianz Bulgaria',
        productType: ProductType.GO,
        ratePct: 0.05,
      });
      expect(result[0].updatedAt).toBe(new Date('2026-01-02').toISOString());
    });
  });

  describe('createPendingEvent', () => {
    it('delegates to commissionsRepo.createPendingEvent with correct data', async () => {
      mockRepo.createPendingEvent.mockResolvedValue({ id: 'event-id' });

      const data = {
        tenantId: 'tenant-uuid',
        paymentId: 'payment-uuid',
        insurerId: 'insurer-uuid',
        productType: 'GO' as const,
        premiumAmount: 450,
        commissionPct: 0.05,
        commissionAmount: 22.5,
      };

      await service.createPendingEvent(data);

      expect(mockRepo.createPendingEvent).toHaveBeenCalledWith(data);
    });
  });

  describe('confirmPendingEvent', () => {
    it('delegates to commissionsRepo.confirmPendingEvent with paymentId and tenantId', async () => {
      mockRepo.confirmPendingEvent.mockResolvedValue(undefined);

      await service.confirmPendingEvent('payment-uuid', 'tenant-uuid');

      expect(mockRepo.confirmPendingEvent).toHaveBeenCalledWith(
        'payment-uuid',
        'tenant-uuid',
      );
    });
  });

  describe('failPendingEvent', () => {
    it('delegates to commissionsRepo.failPendingEvent with paymentId and tenantId', async () => {
      mockRepo.failPendingEvent.mockResolvedValue(undefined);

      await service.failPendingEvent('payment-uuid', 'tenant-uuid');

      expect(mockRepo.failPendingEvent).toHaveBeenCalledWith(
        'payment-uuid',
        'tenant-uuid',
      );
    });
  });

  describe('getDashboardStats', () => {
    const allianzId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const generaliId = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

    const rawRows: DashboardRawRow[] = [
      {
        id: 'policy-1',
        insurer_id: allianzId,
        insurer_name: 'Allianz Bulgaria',
        premium_amount: '450.00',
        commission_pct: '0.0500',
        commission_amount: '22.50',
        created_at: new Date('2026-03-01T10:00:00Z'),
        commission_status: 'confirmed',
        product_type: 'GO',
      },
      {
        id: 'pending-1',
        insurer_id: generaliId,
        insurer_name: 'Generali Bulgaria',
        premium_amount: '320.00',
        commission_pct: '0.0450',
        commission_amount: '14.40',
        created_at: new Date('2026-03-15T12:00:00Z'),
        commission_status: 'pending',
        product_type: 'GO',
      },
      {
        id: 'policy-2',
        insurer_id: allianzId,
        insurer_name: 'Allianz Bulgaria',
        premium_amount: '500.00',
        commission_pct: '0.0500',
        commission_amount: '25.00',
        created_at: new Date('2026-03-20T09:00:00Z'),
        commission_status: 'confirmed',
        product_type: 'GO',
      },
    ];

    it('aggregates data and computes summary correctly', async () => {
      mockRepo.getDashboardData.mockResolvedValue(rawRows);

      const query: CommissionDashboardQueryDto = {};
      const result = await service.getDashboardStats('tenant-uuid', query);

      expect(result.summary.totalPolicies).toBe(3);
      expect(result.summary.totalPremium).toBeCloseTo(1270, 1);
      expect(result.summary.totalCommission).toBeCloseTo(61.9, 1);
      expect(result.summary.currency).toBe('BGN');
    });

    it('returns byInsurer breakdown with correct counts', async () => {
      mockRepo.getDashboardData.mockResolvedValue(rawRows);

      const query: CommissionDashboardQueryDto = {};
      const result = await service.getDashboardStats('tenant-uuid', query);

      const allianz = result.byInsurer.find((b) => b.insurerId === allianzId);
      expect(allianz?.policiesCount).toBe(2);
      expect(allianz?.totalPremium).toBeCloseTo(950, 1);
      expect(allianz?.totalCommission).toBeCloseTo(47.5, 1);

      const generali = result.byInsurer.find((b) => b.insurerId === generaliId);
      expect(generali?.policiesCount).toBe(1);
      expect(generali?.totalCommission).toBeCloseTo(14.4, 1);
    });

    it('maps policies list with correct commissionStatus', async () => {
      mockRepo.getDashboardData.mockResolvedValue(rawRows);

      const query: CommissionDashboardQueryDto = {};
      const result = await service.getDashboardStats('tenant-uuid', query);

      expect(result.policies).toHaveLength(3);
      const confirmed = result.policies.filter(
        (p) => p.commissionStatus === 'confirmed',
      );
      const pending = result.policies.filter(
        (p) => p.commissionStatus === 'pending',
      );
      expect(confirmed).toHaveLength(2);
      expect(pending).toHaveLength(1);
    });

    it('applies default 30-day dateFrom when not provided', async () => {
      mockRepo.getDashboardData.mockResolvedValue([]);

      const query: CommissionDashboardQueryDto = {};
      await service.getDashboardStats('tenant-uuid', query);

      const callArgs = mockRepo.getDashboardData.mock.calls[0] as [
        string,
        {
          dateFrom: string;
          dateTo: string | undefined;
          insurerId: string | undefined;
        },
      ];
      const filters = callArgs[1];
      expect(filters.dateFrom).toBeDefined();
      const dateFrom = new Date(filters.dateFrom);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      expect(
        Math.abs(dateFrom.getTime() - thirtyDaysAgo.getTime()),
      ).toBeLessThan(5000);
    });

    it('forwards filters to getDashboardData when provided', async () => {
      mockRepo.getDashboardData.mockResolvedValue([]);

      const query: CommissionDashboardQueryDto = {
        dateFrom: '2026-01-01',
        dateTo: '2026-03-31',
        insurerId: allianzId,
      };
      await service.getDashboardStats('tenant-uuid', query);

      expect(mockRepo.getDashboardData).toHaveBeenCalledWith('tenant-uuid', {
        dateFrom: '2026-01-01',
        dateTo: '2026-03-31',
        insurerId: allianzId,
      });
    });

    it('returns empty collections when no data found', async () => {
      mockRepo.getDashboardData.mockResolvedValue([]);

      const query: CommissionDashboardQueryDto = {};
      const result = await service.getDashboardStats('tenant-uuid', query);

      expect(result.summary.totalPolicies).toBe(0);
      expect(result.summary.totalPremium).toBe(0);
      expect(result.summary.totalCommission).toBe(0);
      expect(result.byInsurer).toHaveLength(0);
      expect(result.policies).toHaveLength(0);
    });
  });
});
