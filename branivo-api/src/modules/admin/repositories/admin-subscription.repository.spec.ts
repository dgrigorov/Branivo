import { AdminSubscriptionRepository } from './admin-subscription.repository';
import { PendingDowngrade } from '../../tenants/entities/tenant.entity';

describe('AdminSubscriptionRepository', () => {
  let repository: AdminSubscriptionRepository;
  let mockQuery: jest.Mock;
  let mockManagerQuery: jest.Mock;

  beforeEach(() => {
    mockQuery = jest.fn();
    mockManagerQuery = jest.fn().mockResolvedValue([]);

    const dataSource = {
      query: mockQuery,
      transaction: jest
        .fn()
        .mockImplementation(
          async (cb: (manager: { query: jest.Mock }) => Promise<void>) => {
            await cb({ query: mockManagerQuery });
          },
        ),
    };

    repository = new AdminSubscriptionRepository(dataSource as never);
  });

  describe('findTenantById()', () => {
    it('трябва да върне тенант при съществуващ id', async () => {
      const mockRow = {
        id: 'tenant-uuid',
        plan: 'starter',
        features: { fleet: false, sticker_delivery: true },
        pendingDowngrade: null,
      };
      mockQuery.mockResolvedValue([mockRow]);

      const result = await repository.findTenantById('tenant-uuid');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('tenant-uuid');
      expect(result!.plan).toBe('starter');
    });

    it('трябва да върне null при несъществуващ id', async () => {
      mockQuery.mockResolvedValue([]);
      const result = await repository.findTenantById('nonexistent');
      expect(result).toBeNull();
    });

    it('трябва да включва pendingDowngrade когато е наличен', async () => {
      const pending: PendingDowngrade = {
        newPlan: 'starter',
        enforceAt: '2026-03-29T00:00:00.000Z',
      };
      mockQuery.mockResolvedValue([
        {
          id: 'uuid',
          plan: 'professional',
          features: {},
          pendingDowngrade: pending,
        },
      ]);

      const result = await repository.findTenantById('uuid');
      expect(result!.pendingDowngrade).toEqual(pending);
    });
  });

  describe('applyUpgrade()', () => {
    it('трябва да изпълни UPDATE с новия план и features', async () => {
      mockQuery.mockResolvedValue([]);
      const newFeatures = { fleet: true, sticker_delivery: true };

      await repository.applyUpgrade('tenant-uuid', 'professional', newFeatures);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenants'),
        ['tenant-uuid', 'professional', JSON.stringify(newFeatures)],
      );
      const applyUpgradeCall = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(applyUpgradeCall[0]).toContain('pending_downgrade = NULL');
    });
  });

  describe('schedulePendingDowngrade()', () => {
    it('трябва да UPDATE pending_downgrade без да променя features', async () => {
      mockQuery.mockResolvedValue([]);
      const pending: PendingDowngrade = {
        newPlan: 'starter',
        enforceAt: '2026-03-29T00:00:00.000Z',
      };

      await repository.schedulePendingDowngrade('tenant-uuid', pending);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('pending_downgrade = $2'),
        ['tenant-uuid', JSON.stringify(pending)],
      );
    });
  });

  describe('applyPendingDowngrade()', () => {
    it('трябва да UPDATE plan, features и да изчисти pending_downgrade', async () => {
      mockQuery.mockResolvedValue([]);
      const newFeatures = { sticker_delivery: true };

      await repository.applyPendingDowngrade(
        'tenant-uuid',
        'starter',
        newFeatures,
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenants'),
        ['tenant-uuid', 'starter', JSON.stringify(newFeatures)],
      );
      const applyDowngradeCall = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(applyDowngradeCall[0]).toContain('pending_downgrade = NULL');
    });
  });

  describe('findTenantsWithDuePendingDowngrade()', () => {
    it('трябва да върне тенанти с изтекъл grace period', async () => {
      const mockRows = [
        {
          id: 'tenant-uuid',
          plan: 'professional',
          features: { fleet: true },
          pendingDowngrade: {
            newPlan: 'starter',
            enforceAt: '2026-03-20T00:00:00.000Z',
          },
        },
      ];
      mockQuery.mockResolvedValue(mockRows);

      const result = await repository.findTenantsWithDuePendingDowngrade();
      expect(result).toHaveLength(1);
      expect(result[0].pendingDowngrade.newPlan).toBe('starter');
    });

    it('трябва да върне празен масив ако няма изтекли', async () => {
      mockQuery.mockResolvedValue([]);
      const result = await repository.findTenantsWithDuePendingDowngrade();
      expect(result).toHaveLength(0);
    });
  });

  describe('insertAuditLog()', () => {
    it('трябва да извика SET LOCAL и INSERT в транзакция', async () => {
      await repository.insertAuditLog({
        tenantId: 'tenant-uuid',
        userId: 'admin-uuid',
        action: 'subscription.tier_changed',
        entityType: 'tenant',
        entityId: 'tenant-uuid',
        metadata: {
          old_tier: 'starter',
          new_tier: 'professional',
          is_upgrade: true,
        },
      });

      expect(mockManagerQuery).toHaveBeenCalledTimes(2);

      const firstCall = mockManagerQuery.mock.calls[0] as [string, string[]];
      expect(firstCall[0]).toContain('SET LOCAL app.current_tenant_id');
      expect(firstCall[1]).toEqual(['tenant-uuid']);

      const secondCall = mockManagerQuery.mock.calls[1] as [string, unknown[]];
      expect(secondCall[0]).toContain('INSERT INTO audit_log');
      expect(secondCall[1]).toContain('subscription.tier_changed');
    });

    it('трябва да поддържа userId = null (cron job)', async () => {
      await repository.insertAuditLog({
        tenantId: 'tenant-uuid',
        userId: null,
        action: 'subscription.downgrade_enforced',
        entityType: 'tenant',
        entityId: 'tenant-uuid',
        metadata: { old_tier: 'professional', new_tier: 'starter' },
      });

      const secondCall = mockManagerQuery.mock.calls[1] as [string, unknown[]];
      expect(secondCall[1][1]).toBeNull(); // userId = null
    });
  });

  describe('findBrokerAdminEmail()', () => {
    it('трябва да върне email на broker_admin', async () => {
      mockQuery.mockResolvedValue([{ email: 'admin@demo.bg' }]);
      const result = await repository.findBrokerAdminEmail('tenant-uuid');
      expect(result).toBe('admin@demo.bg');
    });

    it('трябва да върне null ако няма broker_admin', async () => {
      mockQuery.mockResolvedValue([]);
      const result = await repository.findBrokerAdminEmail('tenant-uuid');
      expect(result).toBeNull();
    });
  });
});
