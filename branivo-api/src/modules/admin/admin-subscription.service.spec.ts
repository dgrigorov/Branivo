import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminSubscriptionService } from './admin-subscription.service';
import { TenantRow } from './repositories/admin-subscription.repository';
import { PendingDowngrade } from '../tenants/entities/tenant.entity';

const TENANT_UUID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ADMIN_UUID = 'aaaaaaaa-0000-0000-0000-000000000002';

const starterTenant: TenantRow = {
  id: TENANT_UUID,
  plan: 'starter',
  features: { sticker_delivery: true, dkp: false, fleet: false },
  pendingDowngrade: null,
};

const professionalTenant: TenantRow = {
  id: TENANT_UUID,
  plan: 'professional',
  features: { fleet: true, api_access: true, sticker_delivery: true },
  pendingDowngrade: null,
};

const mockRepository = {
  findTenantById: jest.fn(),
  applyUpgrade: jest.fn().mockResolvedValue(undefined),
  schedulePendingDowngrade: jest.fn().mockResolvedValue(undefined),
  applyPendingDowngrade: jest.fn().mockResolvedValue(undefined),
  findTenantsWithDuePendingDowngrade: jest.fn().mockResolvedValue([]),
  insertAuditLog: jest.fn().mockResolvedValue(undefined),
  findBrokerAdminEmail: jest.fn().mockResolvedValue('admin@demo.bg'),
};

const mockEmailService = {
  sendDowngradeNotification: jest.fn().mockResolvedValue(undefined),
};

const mockRedis = {
  del: jest.fn().mockResolvedValue(1),
};

describe('AdminSubscriptionService', () => {
  let service: AdminSubscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminSubscriptionService(
      mockRepository as never,
      mockEmailService as never,
      mockRedis as never,
    );
  });

  describe('previewTierChange()', () => {
    it('трябва да хвърли NotFoundException ако тенантът не е намерен', async () => {
      mockRepository.findTenantById.mockResolvedValue(null);

      await expect(
        service.previewTierChange(TENANT_UUID, 'professional'),
      ).rejects.toThrow(NotFoundException);
    });

    it('трябва да хвърли BadRequestException ако новият план е същия', async () => {
      mockRepository.findTenantById.mockResolvedValue(starterTenant);

      await expect(
        service.previewTierChange(TENANT_UUID, 'starter'),
      ).rejects.toThrow(BadRequestException);
    });

    it('трябва да хвърли BadRequestException за невалиден план', async () => {
      mockRepository.findTenantById.mockResolvedValue(starterTenant);

      await expect(
        service.previewTierChange(TENANT_UUID, 'invalid-plan'),
      ).rejects.toThrow(BadRequestException);
    });

    it('трябва да върне isUpgrade=true за upgrade', async () => {
      mockRepository.findTenantById.mockResolvedValue(starterTenant);

      const result = await service.previewTierChange(
        TENANT_UUID,
        'professional',
      );

      expect(result.isUpgrade).toBe(true);
      expect(result.graceEndsAt).toBeNull();
      expect(result.affectedFlags).toEqual([]);
      expect(result.oldPlan).toBe('starter');
      expect(result.newPlan).toBe('professional');
    });

    it('трябва да върне isUpgrade=false и graceEndsAt за downgrade', async () => {
      mockRepository.findTenantById.mockResolvedValue(professionalTenant);

      const result = await service.previewTierChange(TENANT_UUID, 'starter');

      expect(result.isUpgrade).toBe(false);
      expect(result.graceEndsAt).not.toBeNull();
      expect(result.affectedFlags).toContain('fleet');
      expect(result.affectedFlags).toContain('api_access');
    });
  });

  describe('changeTier() — upgrade', () => {
    it('трябва да приложи upgrade незабавно и инвалидира Redis', async () => {
      mockRepository.findTenantById.mockResolvedValue(starterTenant);

      await service.changeTier(TENANT_UUID, 'professional', ADMIN_UUID);

      expect(mockRepository.applyUpgrade).toHaveBeenCalledWith(
        TENANT_UUID,
        'professional',
        expect.any(Object),
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining(TENANT_UUID),
      );
      expect(mockRepository.schedulePendingDowngrade).not.toHaveBeenCalled();
    });

    it('трябва да логне audit при upgrade', async () => {
      mockRepository.findTenantById.mockResolvedValue(starterTenant);

      await service.changeTier(TENANT_UUID, 'professional', ADMIN_UUID);

      expect(mockRepository.insertAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'subscription.tier_changed',
          metadata: expect.objectContaining({
            old_tier: 'starter',
            new_tier: 'professional',
            is_upgrade: true,
          }) as Record<string, unknown>,
        }),
      );
    });
  });

  describe('changeTier() — downgrade', () => {
    it('трябва да schedule pending downgrade без промяна на features', async () => {
      mockRepository.findTenantById.mockResolvedValue(professionalTenant);

      await service.changeTier(TENANT_UUID, 'starter', ADMIN_UUID);

      expect(mockRepository.schedulePendingDowngrade).toHaveBeenCalledWith(
        TENANT_UUID,
        expect.objectContaining({ newPlan: 'starter' }),
      );
      expect(mockRepository.applyUpgrade).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled(); // не инвалидира при downgrade
    });

    it('трябва да изпрати email notification при downgrade', async () => {
      mockRepository.findTenantById.mockResolvedValue(professionalTenant);

      await service.changeTier(TENANT_UUID, 'starter', ADMIN_UUID);

      expect(mockEmailService.sendDowngradeNotification).toHaveBeenCalledWith(
        'admin@demo.bg',
        expect.any(Array),
        expect.any(String),
      );
    });

    it('не трябва да хвърля грешка ако broker_admin email е null', async () => {
      mockRepository.findTenantById.mockResolvedValue(professionalTenant);
      mockRepository.findBrokerAdminEmail.mockResolvedValue(null);

      await expect(
        service.changeTier(TENANT_UUID, 'starter', ADMIN_UUID),
      ).resolves.not.toThrow();
      expect(mockEmailService.sendDowngradeNotification).not.toHaveBeenCalled();
    });
  });

  describe('enforcePendingDowngrades()', () => {
    it('трябва да приложи downgrade за всеки тенант с изтекъл grace period', async () => {
      const pending: PendingDowngrade = {
        newPlan: 'starter',
        enforceAt: '2026-03-20T01:00:00.000Z',
      };
      mockRepository.findTenantsWithDuePendingDowngrade.mockResolvedValue([
        {
          id: TENANT_UUID,
          plan: 'professional',
          features: { fleet: true, api_access: true, sticker_delivery: true },
          pendingDowngrade: pending,
        },
      ]);

      await service.enforcePendingDowngrades();

      expect(mockRepository.applyPendingDowngrade).toHaveBeenCalledWith(
        TENANT_UUID,
        'starter',
        expect.objectContaining({ fleet: false, api_access: false }),
      );
      expect(mockRepository.insertAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'subscription.downgrade_enforced',
          userId: null,
        }),
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining(TENANT_UUID),
      );
    });

    it('не трябва да прави нищо ако няма изтекли downgrade-и', async () => {
      mockRepository.findTenantsWithDuePendingDowngrade.mockResolvedValue([]);

      await service.enforcePendingDowngrades();

      expect(mockRepository.applyPendingDowngrade).not.toHaveBeenCalled();
      expect(mockRepository.insertAuditLog).not.toHaveBeenCalled();
    });
  });
});
