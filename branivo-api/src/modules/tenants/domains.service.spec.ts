/* eslint-disable @typescript-eslint/unbound-method */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { DomainsService } from './domains.service';
import { TenantsRepository } from './tenants.repository';
import { TenantDomain } from './entities/tenant-domain.entity';

const TENANT_ID = 'tenant-uuid-123';

function makeDomain(overrides: Partial<TenantDomain> = {}): TenantDomain {
  return {
    id: 'domain-uuid-456',
    tenantId: TENANT_ID,
    domain: 'polici.mybrokerage.bg',
    isPrimary: false,
    status: 'pending',
    verificationToken: 'a'.repeat(64),
    verifiedAt: null,
    failureReason: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    tenant: {} as never,
    ...overrides,
  };
}

describe('DomainsService', () => {
  let service: DomainsService;
  let tenantsRepository: jest.Mocked<TenantsRepository>;
  let tenantContext: jest.Mocked<TenantContext>;
  let redis: { del: jest.Mock };

  beforeEach(async () => {
    tenantsRepository = {
      findCustomDomainByTenantId: jest.fn(),
      createCustomDomain: jest.fn(),
      findDomainsByTenantId: jest.fn(),
      findDomainById: jest.fn(),
      deleteDomain: jest.fn(),
    } as unknown as jest.Mocked<TenantsRepository>;

    tenantContext = {
      getTenantId: jest.fn().mockReturnValue(TENANT_ID),
    } as unknown as jest.Mocked<TenantContext>;

    redis = { del: jest.fn().mockResolvedValue(1) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainsService,
        { provide: TenantsRepository, useValue: tenantsRepository },
        { provide: TenantContext, useValue: tenantContext },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get(DomainsService);
  });

  describe('registerDomain', () => {
    it('creates a domain with a 64-char hex token when no existing custom domain', async () => {
      tenantsRepository.findCustomDomainByTenantId.mockResolvedValue(null);
      const createdDomain = makeDomain();
      tenantsRepository.createCustomDomain.mockResolvedValue(createdDomain);

      const result = await service.registerDomain({
        domain: 'polici.mybrokerage.bg',
      });

      expect(tenantsRepository.createCustomDomain).toHaveBeenCalledWith(
        TENANT_ID,
        'polici.mybrokerage.bg',
        expect.stringMatching(/^[0-9a-f]{64}$/),
      );
      expect(result.domain).toBe('polici.mybrokerage.bg');
      expect(result.status).toBe('pending');
    });

    it('throws ConflictException when tenant already has a custom domain', async () => {
      tenantsRepository.findCustomDomainByTenantId.mockResolvedValue(
        makeDomain(),
      );

      await expect(
        service.registerDomain({ domain: 'other.mybrokerage.bg' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listDomains', () => {
    it('returns mapped DTOs for all tenant domains', async () => {
      const primary = makeDomain({
        isPrimary: true,
        status: 'active',
        verificationToken: null,
      });
      const custom = makeDomain();
      tenantsRepository.findDomainsByTenantId.mockResolvedValue([
        primary,
        custom,
      ]);

      const result = await service.listDomains();

      expect(result).toHaveLength(2);
      // Primary active domain has no verificationRecord
      expect(result[0].verificationRecord).toBeNull();
      // Pending domain has verificationRecord
      expect(result[1].verificationRecord).not.toBeNull();
      expect(result[1].verificationRecord?.type).toBe('TXT');
    });

    it('does not expose verificationRecord for failed domains', async () => {
      const failed = makeDomain({
        status: 'failed',
        failureReason: 'DNS TXT record not found within 24 hours.',
        verificationToken: 'a'.repeat(64),
      });
      tenantsRepository.findDomainsByTenantId.mockResolvedValue([failed]);

      const result = await service.listDomains();

      expect(result[0].verificationRecord).toBeNull();
    });
  });

  describe('deleteDomain', () => {
    it('throws NotFoundException when domain not found', async () => {
      tenantsRepository.findDomainById.mockResolvedValue(null);

      await expect(service.deleteDomain('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when trying to delete primary domain', async () => {
      tenantsRepository.findDomainById.mockResolvedValue(
        makeDomain({ isPrimary: true }),
      );

      await expect(service.deleteDomain('domain-uuid-456')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deletes domain and invalidates Redis host cache', async () => {
      const domain = makeDomain({ status: 'active' });
      tenantsRepository.findDomainById.mockResolvedValue(domain);
      tenantsRepository.deleteDomain.mockResolvedValue(undefined);

      await service.deleteDomain('domain-uuid-456');

      expect(tenantsRepository.deleteDomain).toHaveBeenCalledWith(
        'domain-uuid-456',
        TENANT_ID,
      );
      expect(redis.del).toHaveBeenCalledWith(
        expect.stringContaining('polici.mybrokerage.bg'),
      );
    });
  });
});
