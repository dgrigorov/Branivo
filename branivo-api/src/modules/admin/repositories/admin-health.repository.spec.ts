import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AdminHealthRepository } from './admin-health.repository';

const mockQuery = jest.fn();

const mockDataSource = {
  query: mockQuery,
};

describe('AdminHealthRepository', () => {
  let repo: AdminHealthRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminHealthRepository,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    repo = module.get<AdminHealthRepository>(AdminHealthRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAllTenantsHealth', () => {
    it('returns mapped TenantHealthSummaryResponseDto array', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce([
        {
          tenantId: 'uuid-1',
          tenantName: 'Demo Broker',
          slug: 'demo',
          status: 'active',
          subscriptionTier: 'starter',
          policiesLast30Days: '5',
          lastActivityAt: now,
        },
      ]);

      const result = await repo.findAllTenantsHealth();

      expect(result).toHaveLength(1);
      expect(result[0].tenantId).toBe('uuid-1');
      expect(result[0].tenantName).toBe('Demo Broker');
      expect(result[0].policiesLast30Days).toBe(5);
      expect(result[0].lastActivityAt).toBe(now.toISOString());
      expect(result[0].inactiveDays).toBeGreaterThanOrEqual(0);
    });

    it('returns inactiveDays as null when no lastActivityAt', async () => {
      mockQuery.mockResolvedValueOnce([
        {
          tenantId: 'uuid-2',
          tenantName: 'New Broker',
          slug: 'new',
          status: 'active',
          subscriptionTier: null,
          policiesLast30Days: '0',
          lastActivityAt: null,
        },
      ]);

      const result = await repo.findAllTenantsHealth();

      expect(result[0].inactiveDays).toBeNull();
      expect(result[0].lastActivityAt).toBeNull();
    });

    it('returns empty array when no tenants', async () => {
      mockQuery.mockResolvedValueOnce([]);
      const result = await repo.findAllTenantsHealth();
      expect(result).toEqual([]);
    });
  });

  describe('findTenantHealthDetail', () => {
    it('returns null when tenant not found', async () => {
      mockQuery.mockResolvedValueOnce([]);
      const result = await repo.findTenantHealthDetail('non-existing-id');
      expect(result).toBeNull();
    });

    it('returns mapped TenantHealthDetailResponseDto', async () => {
      const lastPolicy = new Date('2026-03-01T10:00:00Z');
      mockQuery.mockResolvedValueOnce([
        {
          tenantId: 'uuid-1',
          tenantName: 'Demo Broker',
          activeUsersCount: '3',
          totalRevenueBgn: '1500.50',
          vehicleCount: '10',
          lastPolicyCreatedAt: lastPolicy,
          lastPolicyInsurer: 'Bulins',
          activeFeatureFlags: {
            fleet: true,
            api_access: false,
            custom_domain: true,
          },
        },
      ]);

      const result = await repo.findTenantHealthDetail('uuid-1');

      expect(result).not.toBeNull();
      expect(result!.activeUsersCount).toBe(3);
      expect(result!.totalRevenueBgn).toBe(1500.5);
      expect(result!.vehicleCount).toBe(10);
      expect(result!.lastPolicyCreatedAt).toBe(lastPolicy.toISOString());
      expect(result!.lastPolicyInsurer).toBe('Bulins');
      expect(result!.activeFeatureFlags).toEqual(['fleet', 'custom_domain']);
    });

    it('handles null feature_flags', async () => {
      mockQuery.mockResolvedValueOnce([
        {
          tenantId: 'uuid-1',
          tenantName: 'Broker',
          activeUsersCount: '0',
          totalRevenueBgn: '0',
          vehicleCount: '0',
          lastPolicyCreatedAt: null,
          lastPolicyInsurer: null,
          activeFeatureFlags: null,
        },
      ]);

      const result = await repo.findTenantHealthDetail('uuid-1');
      expect(result!.activeFeatureFlags).toEqual([]);
      expect(result!.lastPolicyCreatedAt).toBeNull();
    });
  });

  describe('findTenantsWithInactiveDays', () => {
    it('returns inactive tenants sorted by inactiveDays desc', async () => {
      mockQuery.mockResolvedValueOnce([
        {
          tenantId: 'uuid-3',
          tenantName: 'Sleeping Broker',
          inactiveDays: '14',
        },
        { tenantId: 'uuid-4', tenantName: 'New Broker', inactiveDays: null },
      ]);

      const result = await repo.findTenantsWithInactiveDays(7);

      expect(result).toHaveLength(2);
      expect(result[0].inactiveDays).toBe(14);
      expect(result[1].inactiveDays).toBe(0);
    });

    it('passes days parameter to query (not hardcoded)', async () => {
      mockQuery.mockResolvedValueOnce([]);

      await repo.findTenantsWithInactiveDays(14);

      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(params[0]).toBe(14);
      expect(sql).toContain('$1');
      expect(sql).not.toMatch(/INTERVAL '7 days'/);
    });

    it('returns empty array when no inactive tenants', async () => {
      mockQuery.mockResolvedValueOnce([]);
      const result = await repo.findTenantsWithInactiveDays(7);
      expect(result).toEqual([]);
    });
  });

  describe('countOrphanedPolicies', () => {
    it('returns count of orphaned policies', async () => {
      mockQuery.mockResolvedValueOnce([{ count: '3' }]);
      const result = await repo.countOrphanedPolicies();
      expect(result).toBe(3);
    });

    it('returns 0 when no orphaned policies', async () => {
      mockQuery.mockResolvedValueOnce([{ count: '0' }]);
      const result = await repo.countOrphanedPolicies();
      expect(result).toBe(0);
    });

    it('returns 0 on empty result', async () => {
      mockQuery.mockResolvedValueOnce([]);
      const result = await repo.countOrphanedPolicies();
      expect(result).toBe(0);
    });
  });
});
