/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsRepository } from './tenants.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { RedisKeyHelper } from '../../common/helpers/redis-key.helper';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockDto = {
  id: TENANT_ID,
  slug: 'broker1',
  name: 'Broker One',
  status: 'active',
  plan: 'starter',
  features: { fleet: false },
  branding: {
    primaryColor: '#1A56DB',
    logoUrl: null,
    supportEmail: null,
    supportPhone: null,
  },
};

const mockTenant = {
  id: TENANT_ID,
  slug: 'broker1',
  name: 'Broker One',
  status: 'active',
  plan: 'starter',
  features: { fleet: false },
  config: null,
};

const mockTenantsRepository = {
  findTenantWithConfig: jest.fn(),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
} as unknown as TenantContext;

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

function buildService(): TenantsService {
  return new TenantsService(
    mockTenantsRepository as unknown as TenantsRepository,
    mockTenantContext,
    mockRedis as any,
  );
}

describe('TenantsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTenantConfig', () => {
    it('returns cached config from Redis without hitting DB', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(mockDto));

      const result = await buildService().getTenantConfig();

      expect(mockRedis.get).toHaveBeenCalledWith(
        RedisKeyHelper.build(TENANT_ID, 'config', 'tenant'),
      );
      expect(mockTenantsRepository.findTenantWithConfig).not.toHaveBeenCalled();
      expect(result).toEqual(mockDto);
    });

    it('fetches from DB on cache miss and caches the result', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockTenantsRepository.findTenantWithConfig.mockResolvedValueOnce(
        mockTenant,
      );
      mockRedis.set.mockResolvedValueOnce('OK');

      const result = await buildService().getTenantConfig();

      expect(mockTenantsRepository.findTenantWithConfig).toHaveBeenCalledWith(
        TENANT_ID,
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        RedisKeyHelper.build(TENANT_ID, 'config', 'tenant'),
        JSON.stringify(result),
        'EX',
        300,
      );
    });

    it('throws NotFoundException when tenant not found in DB', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockTenantsRepository.findTenantWithConfig.mockResolvedValueOnce(null);

      await expect(buildService().getTenantConfig()).rejects.toThrow(
        NotFoundException,
      );
    });

    it('falls back to DB gracefully when Redis is unavailable', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis unavailable'));
      mockTenantsRepository.findTenantWithConfig.mockResolvedValueOnce(
        mockTenant,
      );
      mockRedis.set.mockRejectedValueOnce(new Error('Redis unavailable'));

      const result = await buildService().getTenantConfig();

      expect(result).toHaveProperty('id', TENANT_ID);
    });

    it('response never includes sensitive fields', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockTenantsRepository.findTenantWithConfig.mockResolvedValueOnce(
        mockTenant,
      );

      const result = await buildService().getTenantConfig();

      expect(result).not.toHaveProperty('api_key_enc');
      expect(result).not.toHaveProperty('stripe_credentials');
      expect(result).toHaveProperty('branding');
    });
  });
});
