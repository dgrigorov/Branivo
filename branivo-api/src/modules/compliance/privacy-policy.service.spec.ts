import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PrivacyPolicyService } from './privacy-policy.service';
import { TenantPrivacyPolicy } from './entities/tenant-privacy-policy.entity';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { AuditService } from '../../common/audit/audit.service';
import { CreatePrivacyPolicyDto } from './dto/create-privacy-policy.dto';

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_TENANT_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const USER_ID = 'cccccccc-0000-0000-0000-000000000003';
const POLICY_ID = 'dddddddd-0000-0000-0000-000000000004';

const mockRepo = {
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

function makePolicyEntity(
  overrides: Partial<TenantPrivacyPolicy> = {},
): TenantPrivacyPolicy {
  return {
    id: POLICY_ID,
    tenantId: TENANT_ID,
    version: 1,
    content: '# Privacy Policy',
    language: 'bg',
    isPublished: false,
    publishedAt: null,
    createdBy: USER_ID,
    createdAt: new Date('2026-04-05T00:00:00Z'),
    updatedAt: new Date('2026-04-05T00:00:00Z'),
    deletedAt: null,
    tenant:
      undefined as unknown as import('../tenants/entities/tenant.entity').Tenant,
    ...overrides,
  };
}

describe('PrivacyPolicyService', () => {
  let service: PrivacyPolicyService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivacyPolicyService,
        {
          provide: getRepositoryToken(TenantPrivacyPolicy),
          useValue: mockRepo,
        },
        { provide: TenantContext, useValue: mockTenantContext },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<PrivacyPolicyService>(PrivacyPolicyService);
  });

  // AC9 case 1: create draft → version auto-increment
  describe('create', () => {
    it('creates first version as 1 when no prior versions exist', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxVersion: null }),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      const savedPolicy = makePolicyEntity({ version: 1 });
      mockRepo.save.mockResolvedValue(savedPolicy);

      const dto: CreatePrivacyPolicyDto = {
        content: '# Policy',
        language: 'bg',
      };
      const result = await service.create(dto, USER_ID);

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          version: 1,
          language: 'bg',
        }),
      );
      expect(result.version).toBe(1);
      expect(result.isPublished).toBe(false);
    });

    it('auto-increments version when prior versions exist', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxVersion: 3 }),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      const savedPolicy = makePolicyEntity({ version: 4 });
      mockRepo.save.mockResolvedValue(savedPolicy);

      const dto: CreatePrivacyPolicyDto = {
        content: '# Policy v4',
        language: 'bg',
      };
      const result = await service.create(dto, USER_ID);

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ version: 4 }),
      );
      expect(result.version).toBe(4);
    });
  });

  // AC9 case 2: publish → publishedAt is recorded
  describe('publish', () => {
    it('sets isPublished=true and publishedAt on publish', async () => {
      const draft = makePolicyEntity({ isPublished: false, publishedAt: null });
      mockRepo.findOne.mockResolvedValue(draft);
      const published = makePolicyEntity({
        isPublished: true,
        publishedAt: new Date(),
      });
      mockRepo.save.mockResolvedValue(published);

      const result = await service.publish(POLICY_ID, USER_ID);

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isPublished: true }),
      );
      expect(result.isPublished).toBe(true);
      expect(result.publishedAt).not.toBeNull();
    });

    it('writes audit_log entry on publish', async () => {
      const draft = makePolicyEntity({ isPublished: false });
      mockRepo.findOne.mockResolvedValue(draft);
      mockRepo.save.mockResolvedValue(
        makePolicyEntity({ isPublished: true, publishedAt: new Date() }),
      );

      await service.publish(POLICY_ID, USER_ID);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          action: 'privacy_policy.published',
          entityType: 'tenant_privacy_policy',
          entityId: POLICY_ID,
        }),
      );
    });

    it('throws NotFoundException when policy not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.publish('nonexistent-id', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // AC9 case 3 & 4: getPublished returns MAX(version) or throws
  describe('getPublished', () => {
    it('returns the latest published version', async () => {
      const publishedPolicy = makePolicyEntity({
        version: 3,
        isPublished: true,
        publishedAt: new Date(),
      });
      mockRepo.findOne.mockResolvedValue(publishedPolicy);

      const result = await service.getPublished('bg');

      const findOneArg = mockRepo.findOne.mock.calls[0] as [
        {
          where: { tenantId: string; isPublished: boolean };
          order: { version: string };
        },
      ];
      expect(findOneArg[0].where.tenantId).toBe(TENANT_ID);
      expect(findOneArg[0].where.isPublished).toBe(true);
      expect(findOneArg[0].order).toEqual({ version: 'DESC' });
      expect(result.version).toBe(3);
    });

    it('throws NotFoundException when no published policy exists', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.getPublished('bg')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // AC9 case 5: tenant isolation
  describe('findAll (tenant isolation)', () => {
    it('scopes query to current tenant — other tenant gets 0 results', async () => {
      mockTenantContext.getTenantId.mockReturnValue(OTHER_TENANT_ID);
      mockRepo.find.mockResolvedValue([]);

      const result = await service.findAll();

      const findArg = mockRepo.find.mock.calls[0] as [
        { where: { tenantId: string } },
      ];
      expect(findArg[0].where.tenantId).toBe(OTHER_TENANT_ID);
      expect(result).toHaveLength(0);
    });
  });
});
