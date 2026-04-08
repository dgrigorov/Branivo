import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { DataBreachService } from './data-breach.service';
import { DataBreachAlertJob } from './data-breach-alert.job';
import { DataBreach, BreachStatus } from './entities/data-breach.entity';
import { AuditService } from '../../common/audit/audit.service';
import { EmailService } from '../../infrastructure/email/email.service';
import { ReportDataBreachDto } from './dto/report-data-breach.dto';
import { UpdateDataBreachDto } from './dto/update-data-breach.dto';
import { ListDataBreachesDto } from './dto/list-data-breaches.dto';

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_ID = 'cccccccc-0000-0000-0000-000000000003';
const BREACH_ID = 'dddddddd-0000-0000-0000-000000000004';

const mockRepo = {
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockDataSource = {
  query: jest.fn(),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockEmailService = {
  transporter: {
    sendMail: jest.fn().mockResolvedValue(undefined),
  },
};

const mockConfigService = {
  get: jest.fn().mockReturnValue(undefined),
};

function makeBreachEntity(overrides: Partial<DataBreach> = {}): DataBreach {
  const detectedAt = new Date('2026-04-05T10:00:00Z');
  const deadline = new Date(detectedAt.getTime() + 72 * 60 * 60 * 1000);
  return {
    id: BREACH_ID,
    tenantId: TENANT_ID,
    tenant: null,
    title: 'Test breach',
    description: 'A test description',
    breachType: 'unauthorized_access',
    severity: 'high',
    detectedAt,
    reportedBy: USER_ID,
    affectedDataCategories: ['email'],
    affectedSubjectsCount: 10,
    affectedSubjectsDescription: null,
    kzldNotificationRequired: true,
    kzldNotifiedAt: null,
    kzldNotificationReference: null,
    kzldNotificationDeadline: deadline,
    clientNotificationRequired: false,
    clientNotificationSentAt: null,
    status: 'detected' as BreachStatus,
    containmentActions: null,
    remediationActions: null,
    lessonsLearned: null,
    closedAt: null,
    createdAt: new Date('2026-04-05T10:00:00Z'),
    updatedAt: new Date('2026-04-05T10:00:00Z'),
    ...overrides,
  } as DataBreach;
}

function makeReportDto(
  overrides: Partial<ReportDataBreachDto> = {},
): ReportDataBreachDto {
  return {
    tenantId: TENANT_ID,
    title: 'Test breach',
    description: 'A test description',
    breachType: 'unauthorized_access',
    severity: 'high',
    detectedAt: new Date('2026-04-05T10:00:00Z').toISOString(),
    affectedDataCategories: ['email'],
    affectedSubjectsCount: 10,
    ...overrides,
  } as ReportDataBreachDto;
}

describe('DataBreachService', () => {
  let service: DataBreachService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default mock for createQueryBuilder used in getBreaches
    const mockQb = {
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    mockRepo.createQueryBuilder.mockReturnValue(mockQb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataBreachService,
        {
          provide: getRepositoryToken(DataBreach),
          useValue: mockRepo,
        },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AuditService, useValue: mockAuditService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(DataBreachService);
  });

  describe('reportBreach()', () => {
    it('creates record, fires audit log, and sends email alert', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: TENANT_ID }]);
      const savedBreach = makeBreachEntity();
      mockRepo.save.mockResolvedValue(savedBreach);

      const dto = makeReportDto();
      const result = await service.reportBreach(dto, USER_ID);

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'data_breach.reported',
          entityType: 'data_breach',
          entityId: BREACH_ID,
        }),
      );
      expect(mockEmailService.transporter.sendMail).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(BREACH_ID);
    });

    it('auto-elevates severity to high when EGN data is included', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: TENANT_ID }]);
      const savedBreach = makeBreachEntity({ severity: 'high' });
      mockRepo.save.mockResolvedValue(savedBreach);

      const dto = makeReportDto({
        severity: 'low',
        affectedDataCategories: ['egn', 'email'],
      });

      await service.reportBreach(dto, USER_ID);

      const saveArgs = mockRepo.save.mock.calls as [Partial<DataBreach>][];
      expect(saveArgs[0][0].severity).toBe('high');
    });

    it('auto-elevates severity when health_data is included', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: TENANT_ID }]);
      const savedBreach = makeBreachEntity({ severity: 'high' });
      mockRepo.save.mockResolvedValue(savedBreach);

      const dto = makeReportDto({
        severity: 'medium',
        affectedDataCategories: ['health_data'],
      });

      await service.reportBreach(dto, USER_ID);

      const saveArgs = mockRepo.save.mock.calls as [Partial<DataBreach>][];
      expect(saveArgs[0][0].severity).toBe('high');
    });

    it('throws BadRequestException when detectedAt is in the future', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const dto = makeReportDto({ detectedAt: futureDate });

      await expect(service.reportBreach(dto, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when tenantId does not exist', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      const dto = makeReportDto();

      await expect(service.reportBreach(dto, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not send email alert when kzldNotificationRequired is false', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: TENANT_ID }]);
      const savedBreach = makeBreachEntity({ kzldNotificationRequired: false });
      mockRepo.save.mockResolvedValue(savedBreach);

      const dto = makeReportDto({
        kzldNotificationRequired: false,
      });

      await service.reportBreach(dto, USER_ID);

      expect(mockEmailService.transporter.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('updateBreach()', () => {
    it('updates only mutable fields; immutable fields are not touched', async () => {
      const breach = makeBreachEntity();
      mockRepo.findOne.mockResolvedValue(breach);
      mockRepo.save.mockImplementation((b: DataBreach) => Promise.resolve(b));

      const dto: UpdateDataBreachDto = {
        status: 'investigating',
        containmentActions: 'Isolated affected system',
      };

      const result = await service.updateBreach(BREACH_ID, dto, USER_ID);

      expect(result.status).toBe('investigating');
      expect(result.containmentActions).toBe('Isolated affected system');
      // Immutable fields unchanged
      expect(result.title).toBe(breach.title);
      expect(result.breachType).toBe(breach.breachType);
    });

    it('auto-sets closedAt when status is set to closed', async () => {
      const breach = makeBreachEntity();
      mockRepo.findOne.mockResolvedValue(breach);
      mockRepo.save.mockImplementation((b: DataBreach) => Promise.resolve(b));

      const dto: UpdateDataBreachDto = { status: 'closed' };
      const result = await service.updateBreach(BREACH_ID, dto, USER_ID);

      expect(result.status).toBe('closed');
      expect(result.closedAt).toBeDefined();
      expect(result.closedAt).not.toBeNull();
    });

    it('throws NotFoundException when breach does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateBreach('nonexistent-id', {}, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBreaches()', () => {
    it('returns paginated results with correct metadata', async () => {
      const breach = makeBreachEntity();
      const mockQb = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[breach], 1]),
      };
      mockRepo.createQueryBuilder.mockReturnValue(mockQb);

      const query: ListDataBreachesDto = { page: 1, limit: 20 };
      const result = await service.getBreaches(query);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.items).toHaveLength(1);
    });

    it('computes isOverdue correctly for past deadline breach', async () => {
      const pastDeadline = new Date(Date.now() - 1000);
      const breach = makeBreachEntity({
        kzldNotifiedAt: null,
        kzldNotificationDeadline: pastDeadline,
        kzldNotificationRequired: true,
      });

      const mockQb = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[breach], 1]),
      };
      mockRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getBreaches({});
      expect(result.items[0].isOverdue).toBe(true);
    });

    it('computes hoursUntilDeadline as null when already notified', async () => {
      const breach = makeBreachEntity({
        kzldNotifiedAt: new Date('2026-04-06T00:00:00Z'),
      });

      const mockQb = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[breach], 1]),
      };
      mockRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getBreaches({});
      expect(result.items[0].hoursUntilDeadline).toBeNull();
    });
  });
});

describe('DataBreachAlertJob deduplication', () => {
  it('does not send alert twice for same breach and type', async () => {
    const redisMock = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
    };

    const detectedAt = new Date(Date.now() - 20 * 60 * 60 * 1000); // 20h ago
    const deadline = new Date(detectedAt.getTime() + 72 * 60 * 60 * 1000); // 52h from now
    const breach = makeBreachEntity({
      kzldNotifiedAt: null,
      kzldNotificationDeadline: deadline,
    });

    const mockDataBreachService = {
      getPendingAlertBreaches: jest.fn().mockResolvedValue([breach]),
      sendBreachAlert: jest.fn().mockResolvedValue(undefined),
    };

    // Simulate already-sent key
    redisMock.get.mockResolvedValue('1');

    const job = new DataBreachAlertJob(
      mockDataBreachService as unknown as DataBreachService,
      redisMock as unknown as Redis,
    );

    await job.runBreachDeadlineAlerts();

    // Alert should not be sent because dedup key already exists
    expect(mockDataBreachService.sendBreachAlert).not.toHaveBeenCalled();
  });

  it('sends 24h alert when no dedup key exists and deadline is within 24h', async () => {
    const redisMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };

    // Deadline in 20 hours
    const detectedAt = new Date(Date.now() - 52 * 60 * 60 * 1000);
    const deadline = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const breach = makeBreachEntity({
      kzldNotifiedAt: null,
      kzldNotificationDeadline: deadline,
      detectedAt,
    });

    const mockDataBreachService = {
      getPendingAlertBreaches: jest.fn().mockResolvedValue([breach]),
      sendBreachAlert: jest.fn().mockResolvedValue(undefined),
    };

    const job = new DataBreachAlertJob(
      mockDataBreachService as unknown as DataBreachService,
      redisMock as unknown as Redis,
    );

    await job.runBreachDeadlineAlerts();

    expect(mockDataBreachService.sendBreachAlert).toHaveBeenCalledWith(
      'data-breach-24h-warning',
      breach,
    );
    expect(redisMock.set).toHaveBeenCalledWith(
      expect.stringContaining('data-breach-24h-warning'),
      '1',
      'EX',
      14400,
    );
  });
});
