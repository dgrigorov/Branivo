/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsRepository } from './tenants.repository';
import { S3Service } from '../../infrastructure/s3/s3.service';
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
    secondaryColor: null,
    brandFont: null,
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
  upsertBranding: jest.fn(),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
} as unknown as TenantContext;

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockS3Service = {
  uploadLogo: jest.fn(),
};

function buildService(): TenantsService {
  return new TenantsService(
    mockTenantsRepository as unknown as TenantsRepository,
    mockTenantContext,
    mockS3Service as unknown as S3Service,
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

    it('includes secondaryColor and brandFont in branding response', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockTenantsRepository.findTenantWithConfig.mockResolvedValueOnce({
        ...mockTenant,
        config: {
          primaryColor: '#1A56DB',
          secondaryColor: '#003366',
          brandFont: 'Inter',
          logoUrl: null,
          supportEmail: null,
          supportPhone: null,
        },
      });

      const result = await buildService().getTenantConfig();

      expect(result.branding.secondaryColor).toBe('#003366');
      expect(result.branding.brandFont).toBe('Inter');
    });
  });

  describe('updateBranding', () => {
    beforeEach(() => {
      mockTenantsRepository.upsertBranding.mockResolvedValue(undefined);
      mockRedis.del.mockResolvedValue(1);
    });

    it('saves valid primaryColor and invalidates Redis cache', async () => {
      await buildService().updateBranding({ primaryColor: '#1A56DB' });

      expect(mockTenantsRepository.upsertBranding).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ primaryColor: '#1A56DB' }),
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        RedisKeyHelper.build(TENANT_ID, 'config', 'tenant'),
      );
    });

    it('throws BadRequestException for non-WCAG-compliant primaryColor', async () => {
      await expect(
        buildService().updateBranding({ primaryColor: '#FFFF00' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockTenantsRepository.upsertBranding).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for non-WCAG-compliant secondaryColor', async () => {
      await expect(
        buildService().updateBranding({
          primaryColor: '#1A56DB',
          secondaryColor: '#FFFF00',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockTenantsRepository.upsertBranding).not.toHaveBeenCalled();
    });

    it('includes color name in BadRequestException message', async () => {
      await expect(
        buildService().updateBranding({ primaryColor: '#FFFFFF' }),
      ).rejects.toThrow('#FFFFFF');
    });

    it('calls S3Service.uploadLogo and saves logoUrl when logo file provided', async () => {
      const logoUrl = 'https://cdn.example.com/tenants/123/logo.png';
      mockS3Service.uploadLogo.mockResolvedValueOnce(logoUrl);

      const logoFile = {
        buffer: Buffer.from('fake-image'),
        mimetype: 'image/png',
      } as Express.Multer.File;

      await buildService().updateBranding(
        { primaryColor: '#1A56DB' },
        logoFile,
      );

      expect(mockS3Service.uploadLogo).toHaveBeenCalledWith(
        TENANT_ID,
        logoFile.buffer,
        'png',
      );
      expect(mockTenantsRepository.upsertBranding).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ logoUrl }),
      );
    });

    it('does not call S3Service.uploadLogo when no logo file', async () => {
      await buildService().updateBranding({ primaryColor: '#1A56DB' });

      expect(mockS3Service.uploadLogo).not.toHaveBeenCalled();
    });

    it('uploads SVG when mimetype is image/svg+xml', async () => {
      mockS3Service.uploadLogo.mockResolvedValueOnce(
        'https://cdn.example.com/logo.svg',
      );

      const svgFile = {
        buffer: Buffer.from('<svg/>'),
        mimetype: 'image/svg+xml',
      } as Express.Multer.File;

      await buildService().updateBranding({}, svgFile);

      expect(mockS3Service.uploadLogo).toHaveBeenCalledWith(
        TENANT_ID,
        svgFile.buffer,
        'svg',
      );
    });

    it('saves brandFont when provided', async () => {
      await buildService().updateBranding({ brandFont: 'Inter' });

      expect(mockTenantsRepository.upsertBranding).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ brandFont: 'Inter' }),
      );
    });
  });
});
