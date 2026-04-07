import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TosService } from './tos.service';
import { TenantTosVersion } from './entities/tenant-tos-version.entity';
import { EndClientTosAcceptance } from './entities/end-client-tos-acceptance.entity';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { AuditService } from '../../common/audit/audit.service';
import { CreateTosDto } from './dto/create-tos.dto';
import { AcceptTosDto } from './dto/accept-tos.dto';

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_TENANT_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const USER_ID = 'cccccccc-0000-0000-0000-000000000003';
const CLIENT_ID = 'dddddddd-0000-0000-0000-000000000004';
const TOS_ID = 'eeeeeeee-0000-0000-0000-000000000005';
const ACCEPTANCE_ID = 'ffffffff-0000-0000-0000-000000000006';

const mockTosRepo = {
  save: jest.fn(),
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockAcceptanceRepo = {
  save: jest.fn(),
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

function makeTosEntity(
  overrides: Partial<TenantTosVersion> = {},
): TenantTosVersion {
  return {
    id: TOS_ID,
    tenantId: TENANT_ID,
    version: 1,
    content: '# ToS',
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

function makeAcceptanceEntity(
  overrides: Partial<EndClientTosAcceptance> = {},
): EndClientTosAcceptance {
  return {
    id: ACCEPTANCE_ID,
    clientId: CLIENT_ID,
    tenantId: TENANT_ID,
    tosVersionId: TOS_ID,
    tosVersion: undefined as unknown as TenantTosVersion,
    acceptedAt: new Date('2026-04-05T00:00:00Z'),
    ipAddress: null,
    userAgent: null,
    ...overrides,
  };
}

describe('TosService', () => {
  let service: TosService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TosService,
        {
          provide: getRepositoryToken(TenantTosVersion),
          useValue: mockTosRepo,
        },
        {
          provide: getRepositoryToken(EndClientTosAcceptance),
          useValue: mockAcceptanceRepo,
        },
        { provide: TenantContext, useValue: mockTenantContext },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<TosService>(TosService);
  });

  // AC13 case 1: create draft → version auto-increment
  describe('create', () => {
    it('creates first version as 1 when no prior versions exist', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxVersion: null }),
      };
      mockTosRepo.createQueryBuilder.mockReturnValue(qb);
      mockTosRepo.save.mockResolvedValue(makeTosEntity({ version: 1 }));

      const dto: CreateTosDto = { content: '# Terms', language: 'bg' };
      const result = await service.create(dto, USER_ID);

      expect(mockTosRepo.save).toHaveBeenCalledWith(
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
      mockTosRepo.createQueryBuilder.mockReturnValue(qb);
      mockTosRepo.save.mockResolvedValue(makeTosEntity({ version: 3 }));

      const dto: CreateTosDto = { content: '# Terms v3', language: 'bg' };
      const result = await service.create(dto, USER_ID);

      expect(mockTosRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ version: 3 }),
      );
      expect(result.version).toBe(3);
    });
  });

  // AC13 case 2: publish → publishedAt is recorded
  describe('publish', () => {
    it('sets isPublished=true and publishedAt on publish', async () => {
      const draft = makeTosEntity({ isPublished: false, publishedAt: null });
      mockTosRepo.findOne.mockResolvedValue(draft);
      mockTosRepo.save.mockResolvedValue(
        makeTosEntity({ isPublished: true, publishedAt: new Date() }),
      );

      const result = await service.publish(TOS_ID, USER_ID);

      expect(mockTosRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isPublished: true }),
      );
      expect(result.isPublished).toBe(true);
      expect(result.publishedAt).not.toBeNull();
    });

    it('writes audit_log entry on publish', async () => {
      const draft = makeTosEntity({ isPublished: false });
      mockTosRepo.findOne.mockResolvedValue(draft);
      mockTosRepo.save.mockResolvedValue(
        makeTosEntity({ isPublished: true, publishedAt: new Date() }),
      );

      await service.publish(TOS_ID, USER_ID);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          action: 'tos.published',
          entityType: 'tenant_tos_version',
          entityId: TOS_ID,
        }),
      );
    });

    it('throws NotFoundException when ToS not found', async () => {
      mockTosRepo.findOne.mockResolvedValue(null);

      await expect(service.publish('nonexistent-id', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when ToS is already published', async () => {
      const alreadyPublished = makeTosEntity({
        isPublished: true,
        publishedAt: new Date(),
      });
      mockTosRepo.findOne.mockResolvedValue(alreadyPublished);

      await expect(service.publish(TOS_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // AC13 case 3: getPublished → returns MAX(version) when is_published=true
  describe('getPublished', () => {
    it('returns the latest published version', async () => {
      const publishedTos = makeTosEntity({
        version: 3,
        isPublished: true,
        publishedAt: new Date(),
      });
      mockTosRepo.findOne.mockResolvedValue(publishedTos);

      const result = await service.getPublished('bg');

      const findOneArg = mockTosRepo.findOne.mock.calls[0] as [
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

    it('throws NotFoundException when no published ToS exists', async () => {
      mockTosRepo.findOne.mockResolvedValue(null);

      await expect(service.getPublished('bg')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // AC13 case 5: accept → UPSERT, idempotent
  describe('accept', () => {
    it('creates acceptance record with client details', async () => {
      mockTosRepo.findOne.mockResolvedValue(
        makeTosEntity({ isPublished: true }),
      );
      const insertQb = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      mockAcceptanceRepo.createQueryBuilder.mockReturnValue(insertQb);
      const acceptance = makeAcceptanceEntity();
      mockAcceptanceRepo.findOneOrFail.mockResolvedValue(acceptance);

      const dto: AcceptTosDto = { tosVersionId: TOS_ID };
      const result = await service.accept(
        CLIENT_ID,
        dto,
        '1.2.3.4',
        'TestAgent',
      );

      expect(insertQb.values).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: CLIENT_ID, tenantId: TENANT_ID }),
      );
      expect(result.accepted).toBe(true);
      expect(result.version).toBe(1);
    });

    it('throws NotFoundException when tosVersionId not in current tenant', async () => {
      mockTosRepo.findOne.mockResolvedValue(null);

      const dto: AcceptTosDto = { tosVersionId: TOS_ID };
      await expect(service.accept(CLIENT_ID, dto, null, null)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when tosVersionId is a draft (not published)', async () => {
      mockTosRepo.findOne.mockResolvedValue(null);

      const dto: AcceptTosDto = { tosVersionId: TOS_ID };
      await expect(service.accept(CLIENT_ID, dto, null, null)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // AC13 case 6: getStatus → requiresAcceptance: true if new version
  describe('getStatus', () => {
    it('returns requiresAcceptance=true when client has not accepted latest', async () => {
      mockTosRepo.findOne.mockResolvedValue(
        makeTosEntity({ version: 2, isPublished: true }),
      );
      const statusQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxVersion: 1 }),
      };
      mockAcceptanceRepo.createQueryBuilder.mockReturnValue(statusQb);

      const result = await service.getStatus(CLIENT_ID);

      expect(result.requiresAcceptance).toBe(true);
      expect(result.acceptedVersion).toBe(1);
    });

    it('returns requiresAcceptance=false when client accepted latest version', async () => {
      mockTosRepo.findOne.mockResolvedValue(
        makeTosEntity({ version: 2, isPublished: true }),
      );
      const statusQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ maxVersion: 2 }),
      };
      mockAcceptanceRepo.createQueryBuilder.mockReturnValue(statusQb);

      const result = await service.getStatus(CLIENT_ID);

      expect(result.requiresAcceptance).toBe(false);
    });

    it('returns requiresAcceptance=false when no ToS is published', async () => {
      mockTosRepo.findOne.mockResolvedValue(null);

      const result = await service.getStatus(CLIENT_ID);

      expect(result.requiresAcceptance).toBe(false);
      expect(result.currentVersion).toBeNull();
    });
  });

  // AC13 case 7: tenant isolation
  describe('findAll (tenant isolation)', () => {
    it('scopes query to current tenant — other tenant gets 0 results', async () => {
      mockTenantContext.getTenantId.mockReturnValue(OTHER_TENANT_ID);
      mockTosRepo.find.mockResolvedValue([]);

      const result = await service.findAll();

      const findArg = mockTosRepo.find.mock.calls[0] as [
        { where: { tenantId: string } },
      ];
      expect(findArg[0].where.tenantId).toBe(OTHER_TENANT_ID);
      expect(result).toHaveLength(0);
    });
  });
});
