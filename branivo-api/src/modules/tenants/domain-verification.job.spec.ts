/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { DomainVerificationJob } from './domain-verification.job';
import { TenantsRepository } from './tenants.repository';
import { DnsVerificationService } from './dns-verification.service';
import { TenantDomain } from './entities/tenant-domain.entity';

function makeDomain(overrides: Partial<TenantDomain> = {}): TenantDomain {
  return {
    id: 'domain-uuid-1',
    tenantId: 'tenant-uuid-1',
    domain: 'polici.mybrokerage.bg',
    isPrimary: false,
    status: 'pending',
    verificationToken: 'a'.repeat(64),
    verifiedAt: null,
    failureReason: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
    updatedAt: new Date(),
    tenant: {} as never,
    ...overrides,
  };
}

describe('DomainVerificationJob', () => {
  let job: DomainVerificationJob;
  let tenantsRepository: jest.Mocked<TenantsRepository>;
  let dnsVerification: jest.Mocked<DnsVerificationService>;
  let redis: { del: jest.Mock };

  beforeEach(async () => {
    tenantsRepository = {
      findPendingOrVerifyingDomains: jest.fn(),
      updateDomainStatus: jest.fn(),
    } as unknown as jest.Mocked<TenantsRepository>;

    dnsVerification = {
      verifyTxtRecord: jest.fn(),
    } as unknown as jest.Mocked<DnsVerificationService>;

    redis = { del: jest.fn().mockResolvedValue(1) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainVerificationJob,
        { provide: TenantsRepository, useValue: tenantsRepository },
        { provide: DnsVerificationService, useValue: dnsVerification },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    job = module.get(DomainVerificationJob);
    jest.clearAllMocks();
  });

  it('does nothing when no pending domains exist', async () => {
    tenantsRepository.findPendingOrVerifyingDomains.mockResolvedValue([]);

    await job.verifyPendingDomains();

    expect(dnsVerification.verifyTxtRecord).not.toHaveBeenCalled();
    expect(tenantsRepository.updateDomainStatus).not.toHaveBeenCalled();
  });

  it('marks domain active and invalidates Redis cache on successful DNS verification', async () => {
    const domain = makeDomain({ status: 'verifying' });
    tenantsRepository.findPendingOrVerifyingDomains.mockResolvedValue([domain]);
    dnsVerification.verifyTxtRecord.mockResolvedValue(true);
    tenantsRepository.updateDomainStatus.mockResolvedValue(undefined);

    await job.verifyPendingDomains();

    expect(tenantsRepository.updateDomainStatus).toHaveBeenCalledWith(
      'domain-uuid-1',
      'active',
      expect.objectContaining({ verifiedAt: expect.any(Date) }),
    );
    expect(redis.del).toHaveBeenCalledWith(
      expect.stringContaining('polici.mybrokerage.bg'),
    );
  });

  it('transitions pending → verifying on first check', async () => {
    const domain = makeDomain({ status: 'pending' });
    tenantsRepository.findPendingOrVerifyingDomains.mockResolvedValue([domain]);
    dnsVerification.verifyTxtRecord.mockResolvedValue(false);
    tenantsRepository.updateDomainStatus.mockResolvedValue(undefined);

    await job.verifyPendingDomains();

    expect(tenantsRepository.updateDomainStatus).toHaveBeenCalledWith(
      'domain-uuid-1',
      'verifying',
    );
  });

  it('does NOT mark failed when domain is verifying and < 24h elapsed', async () => {
    const domain = makeDomain({
      status: 'verifying',
      createdAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
    });
    tenantsRepository.findPendingOrVerifyingDomains.mockResolvedValue([domain]);
    dnsVerification.verifyTxtRecord.mockResolvedValue(false);
    tenantsRepository.updateDomainStatus.mockResolvedValue(undefined);

    await job.verifyPendingDomains();

    // Should NOT be called with 'failed'
    expect(tenantsRepository.updateDomainStatus).not.toHaveBeenCalledWith(
      expect.anything(),
      'failed',
      expect.anything(),
    );
  });

  it('marks domain failed when verification has not succeeded after 24h', async () => {
    const domain = makeDomain({
      status: 'verifying',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 25), // 25 hours ago
    });
    tenantsRepository.findPendingOrVerifyingDomains.mockResolvedValue([domain]);
    dnsVerification.verifyTxtRecord.mockResolvedValue(false);
    tenantsRepository.updateDomainStatus.mockResolvedValue(undefined);

    await job.verifyPendingDomains();

    expect(tenantsRepository.updateDomainStatus).toHaveBeenCalledWith(
      'domain-uuid-1',
      'failed',
      expect.objectContaining({ failureReason: expect.stringContaining('24') }),
    );
  });

  it('skips domain without verificationToken', async () => {
    const domain = makeDomain({ verificationToken: null });
    tenantsRepository.findPendingOrVerifyingDomains.mockResolvedValue([domain]);

    await job.verifyPendingDomains();

    expect(dnsVerification.verifyTxtRecord).not.toHaveBeenCalled();
  });
});
