import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CookiePolicyService } from './cookie-policy.service';
import { TenantCookiePolicy } from './entities/tenant-cookie-policy.entity';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { AuditService } from '../../common/audit/audit.service';
import { CreateCookiePolicyDto } from './dto/create-cookie-policy.dto';

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
  overrides: Partial<TenantCookiePolicy> = {},
): TenantCookiePolicy {
  return {
    id: POLICY_ID,
    tenantId: TENANT_ID,
    version: 1,
    content: '# Cookie Policy',
    language: 'bg',
    isPublished: false,
    publishedAt: null,
    createdBy: USER_ID,
    createdAt: new Date('2026-04-06T00:00:00Z'),
    updatedAt: new Date('2026-04-06T00:00:00Z'),
    deletedAt: null,
    tenant:
      undefined as unknown as import('../tenants/entities/tenant.entity').Tenant,
    ...overrides,
  };
}

describe('CookiePolicyService', () => {
  let service: CookiePolicyService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CookiePolicyService,
        {
          provide: getRepositoryToken(TenantCookiePolicy),
          useValue: mockRepo,
        },
        { provide: TenantContext, useValue: mockTenantContext },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<CookiePolicyService>(CookiePolicyService);
  });

  describe('create', () => {
    it('creates first version as 1 when no prior versions exist', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxVersion: null }),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      const saved = makePolicyEntity({ version: 1 });
      mockRepo.save.mockResolvedValue(saved);

      const dto: CreateCookiePolicyDto = {
        content: '# Cookie',
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
        getRawOne: jest.fn().mockResolvedValue({ maxVersion: 2 }),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      mockRepo.save.mockResolvedValue(makePolicyEntity({ version: 3 }));

      const dto: CreateCookiePolicyDto = { content: '# v3', language: 'bg' };
      const result = await service.create(dto, USER_ID);

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ version: 3 }),
      );
      expect(result.version).toBe(3);
    });
  });

  describe('publish', () => {
    it('sets isPublished=true and publishedAt on publish', async () => {
      mockRepo.findOne.mockResolvedValue(
        makePolicyEntity({ isPublished: false, publishedAt: null }),
      );
      mockRepo.save.mockResolvedValue(
        makePolicyEntity({ isPublished: true, publishedAt: new Date() }),
      );

      const result = await service.publish(POLICY_ID, USER_ID);

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isPublished: true }),
      );
      expect(result.isPublished).toBe(true);
      expect(result.publishedAt).not.toBeNull();
    });

    it('writes audit_log entry via AuditService on publish', async () => {
      mockRepo.findOne.mockResolvedValue(
        makePolicyEntity({ isPublished: false }),
      );
      mockRepo.save.mockResolvedValue(
        makePolicyEntity({ isPublished: true, publishedAt: new Date() }),
      );

      await service.publish(POLICY_ID, USER_ID);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          action: 'cookie_policy.published',
          entityType: 'tenant_cookie_policy',
          entityId: POLICY_ID,
        }),
      );
    });

    it('throws NotFoundException when policy not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.publish('nonexistent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPublished', () => {
    it('returns latest published version (MAX version, is_published=true)', async () => {
      mockRepo.findOne.mockResolvedValue(
        makePolicyEntity({
          version: 5,
          isPublished: true,
          publishedAt: new Date(),
        }),
      );

      const result = await service.getPublished('bg');

      const findArg = mockRepo.findOne.mock.calls[0] as [
        {
          where: { tenantId: string; isPublished: boolean };
          order: { version: string };
        },
      ];
      expect(findArg[0].where.tenantId).toBe(TENANT_ID);
      expect(findArg[0].where.isPublished).toBe(true);
      expect(findArg[0].order).toEqual({ version: 'DESC' });
      expect(result.version).toBe(5);
    });

    it('throws NotFoundException(COOKIE_POLICY_NOT_FOUND) when no published policy', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.getPublished('bg')).rejects.toThrow(
        new NotFoundException('COOKIE_POLICY_NOT_FOUND'),
      );
    });
  });

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
