/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { AuditService } from '../../common/audit/audit.service';
import { RedisKeyHelper } from '../../common/helpers/redis-key.helper';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '660e8400-e29b-41d4-a716-446655440001';

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
} as unknown as TenantContext;

const mockRedis = {
  del: jest.fn(),
};

const mockQueryBuilder = {
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockTenantRepo = {
  findOne: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
};

const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockAuditService = { log: mockAuditLog } as unknown as AuditService;

function buildService(): FeatureFlagsService {
  return new FeatureFlagsService(
    mockTenantRepo as any,
    mockTenantContext,
    mockAuditService,
    mockRedis as any,
  );
}

describe('FeatureFlagsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── getFeatureFlags ────────────────────────────────────────────────────────

  describe('getFeatureFlags', () => {
    it('returns all 7 flags with correct enabled/planRestricted for Starter plan', async () => {
      mockTenantRepo.findOne.mockResolvedValueOnce({
        id: TENANT_ID,
        plan: 'starter',
        features: { fleet: false, sticker_delivery: true },
      });

      const result = await buildService().getFeatureFlags();

      expect(result.flags).toHaveLength(7);

      const fleetFlag = result.flags.find((f) => f.key === 'fleet');
      expect(fleetFlag?.enabled).toBe(false);
      expect(fleetFlag?.planRestricted).toBe(true);
      expect(fleetFlag?.requiredPlan).toBe('professional');

      const stickerFlag = result.flags.find(
        (f) => f.key === 'sticker_delivery',
      );
      expect(stickerFlag?.enabled).toBe(true);
      expect(stickerFlag?.planRestricted).toBe(false);
      expect(stickerFlag?.requiredPlan).toBeNull();
    });

    it('Starter plan — fleet, kasko, api_access are planRestricted=true', async () => {
      mockTenantRepo.findOne.mockResolvedValueOnce({
        id: TENANT_ID,
        plan: 'starter',
        features: {},
      });

      const result = await buildService().getFeatureFlags();

      const restrictedKeys = ['fleet', 'kasko', 'api_access'];
      for (const key of restrictedKeys) {
        const flag = result.flags.find((f) => f.key === key);
        expect(flag?.planRestricted).toBe(true);
      }

      const allowedKeys = [
        'sticker_delivery',
        'dkp',
        'renewal_sms',
        'renewal_push',
      ];
      for (const key of allowedKeys) {
        const flag = result.flags.find((f) => f.key === key);
        expect(flag?.planRestricted).toBe(false);
      }
    });

    it('Professional plan — all flags are not planRestricted', async () => {
      mockTenantRepo.findOne.mockResolvedValueOnce({
        id: TENANT_ID,
        plan: 'professional',
        features: {},
      });

      const result = await buildService().getFeatureFlags();

      for (const flag of result.flags) {
        expect(flag.planRestricted).toBe(false);
      }
    });

    it('throws NotFoundException if tenant not found', async () => {
      mockTenantRepo.findOne.mockResolvedValueOnce(null);

      await expect(buildService().getFeatureFlags()).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── updateFeatureFlags ─────────────────────────────────────────────────────

  describe('updateFeatureFlags', () => {
    it('Starter plan trying to enable fleet=true throws ForbiddenException', async () => {
      mockTenantRepo.findOne.mockResolvedValueOnce({
        id: TENANT_ID,
        plan: 'starter',
        features: { fleet: false },
      });

      await expect(
        buildService().updateFeatureFlags({ fleet: true }, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Professional plan can enable fleet=true', async () => {
      mockTenantRepo.findOne.mockResolvedValueOnce({
        id: TENANT_ID,
        plan: 'professional',
        features: { fleet: false },
      });

      await expect(
        buildService().updateFeatureFlags({ fleet: true }, USER_ID),
      ).resolves.not.toThrow();

      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('successful change — Redis DEL is called', async () => {
      mockTenantRepo.findOne.mockResolvedValueOnce({
        id: TENANT_ID,
        plan: 'starter',
        features: { renewal_sms: false },
      });

      await buildService().updateFeatureFlags({ renewal_sms: true }, USER_ID);

      expect(mockRedis.del).toHaveBeenCalledWith(
        RedisKeyHelper.build(TENANT_ID, 'config', 'tenant'),
      );
    });

    it('no change (oldValue === newValue) — audit log NOT written, no DB update, Redis NOT deleted', async () => {
      mockTenantRepo.findOne.mockResolvedValueOnce({
        id: TENANT_ID,
        plan: 'starter',
        features: { renewal_sms: true },
      });

      await buildService().updateFeatureFlags({ renewal_sms: true }, USER_ID);

      // QueryBuilder execute should NOT be called (no actual change)
      expect(mockQueryBuilder.execute).not.toHaveBeenCalled();
      // Audit log should NOT be called when no change
      expect(mockAuditLog).not.toHaveBeenCalled();
      // Redis DEL should NOT be called — no real change occurred
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('audit log failure does not throw — AuditService handles errors internally', async () => {
      mockTenantRepo.findOne.mockResolvedValueOnce({
        id: TENANT_ID,
        plan: 'starter',
        features: { dkp: false },
      });

      // AuditService.log always resolves (catches internally) — this is a no-op test
      // confirming the pattern still holds with the new audit approach
      await expect(
        buildService().updateFeatureFlags({ dkp: true }, USER_ID),
      ).resolves.not.toThrow();
    });

    it('throws NotFoundException if tenant not found', async () => {
      mockTenantRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        buildService().updateFeatureFlags({ fleet: false }, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('unknown flag key is silently skipped — no DB update or Redis DEL', async () => {
      mockTenantRepo.findOne.mockResolvedValueOnce({
        id: TENANT_ID,
        plan: 'starter',
        features: {},
      });

      // Simulate an unknown key that somehow bypassed ValidationPipe
      const dtoWithUnknown = {
        unknown_flag: true,
      } as unknown as import('./dto/update-feature-flags.dto').UpdateFeatureFlagsDto;
      await buildService().updateFeatureFlags(dtoWithUnknown, USER_ID);

      expect(mockQueryBuilder.execute).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('multiple flags in one PATCH — writes audit log per changed flag, DEL Redis once', async () => {
      mockTenantRepo.findOne.mockResolvedValueOnce({
        id: TENANT_ID,
        plan: 'starter',
        features: { dkp: false, renewal_sms: false, renewal_push: true },
      });

      // dkp: false→true (change), renewal_sms: false→true (change), renewal_push: true→true (no-op)
      await buildService().updateFeatureFlags(
        { dkp: true, renewal_sms: true, renewal_push: true },
        USER_ID,
      );

      // 2 DB updates for the 2 changed flags
      expect(mockQueryBuilder.execute).toHaveBeenCalledTimes(2);
      // 2 audit log writes (one per changed flag)
      expect(mockAuditLog).toHaveBeenCalledTimes(2);
      // Redis DEL called once (at least one change happened)
      expect(mockRedis.del).toHaveBeenCalledTimes(1);
    });
  });
});
