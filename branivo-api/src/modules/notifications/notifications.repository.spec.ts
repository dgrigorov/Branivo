import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotificationsRepository } from './notifications.repository';
import { NotificationLog } from './entities/notification-log.entity';
import {
  TenantRenewalConfig,
  StageConfig,
} from './entities/tenant-renewal-config.entity';

const DEMO_STAGES: StageConfig[] = [
  { stage: 'd_minus_30', channels: ['push'], enabled: true },
  { stage: 'd_minus_7', channels: ['push'], enabled: true },
  { stage: 'd_minus_3', channels: ['sms'], enabled: true },
  { stage: 'd_minus_1', channels: ['email'], enabled: true },
  { stage: 'd_plus_1', channels: ['dashboard'], enabled: true },
];

const mockNotificationLogRepo = {
  insert: jest.fn().mockResolvedValue(undefined),
};

const mockTenantRenewalConfigRepo = {
  findOne: jest.fn(),
};

const mockDataSource = {
  query: jest.fn().mockResolvedValue([]),
};

describe('NotificationsRepository', () => {
  let repository: NotificationsRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsRepository,
        { provide: DataSource, useValue: mockDataSource },
        {
          provide: getRepositoryToken(NotificationLog),
          useValue: mockNotificationLogRepo,
        },
        {
          provide: getRepositoryToken(TenantRenewalConfig),
          useValue: mockTenantRenewalConfigRepo as Partial<
            Repository<TenantRenewalConfig>
          >,
        },
      ],
    }).compile();

    repository = module.get<NotificationsRepository>(NotificationsRepository);
  });

  describe('findTenantRenewalConfig()', () => {
    it('returns StageConfig[] when config exists (AC2)', async () => {
      mockTenantRenewalConfigRepo.findOne.mockResolvedValue({
        id: 'config-1',
        tenantId: 'tenant-1',
        stagesConfig: DEMO_STAGES,
      });

      const result = await repository.findTenantRenewalConfig('tenant-1');

      expect(result).toEqual(DEMO_STAGES);
      expect(mockTenantRenewalConfigRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
      });
    });

    it('returns null when no config found (AC3)', async () => {
      mockTenantRenewalConfigRepo.findOne.mockResolvedValue(null);

      const result = await repository.findTenantRenewalConfig('unknown-tenant');

      expect(result).toBeNull();
    });
  });

  describe('upsertTenantRenewalConfig()', () => {
    it('returns old config when existing config found (AC7)', async () => {
      const oldStages: StageConfig[] = [
        { stage: 'd_minus_30', channels: ['push'], enabled: true },
      ];
      mockTenantRenewalConfigRepo.findOne.mockResolvedValue({
        id: 'config-1',
        tenantId: 'tenant-1',
        stagesConfig: oldStages,
      });
      mockDataSource.query.mockResolvedValue(undefined);

      const result = await repository.upsertTenantRenewalConfig(
        'tenant-1',
        DEMO_STAGES,
      );

      expect(result).toEqual(oldStages);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_renewal_config'),
        expect.arrayContaining(['tenant-1']),
      );
    });

    it('returns null when no previous config exists (AC7)', async () => {
      mockTenantRenewalConfigRepo.findOne.mockResolvedValue(null);
      mockDataSource.query.mockResolvedValue(undefined);

      const result = await repository.upsertTenantRenewalConfig(
        'new-tenant',
        DEMO_STAGES,
      );

      expect(result).toBeNull();
    });
  });

  describe('findTenantSlug()', () => {
    it('returns slug when tenant exists', async () => {
      mockDataSource.query.mockResolvedValue([{ slug: 'demo' }]);

      const result = await repository.findTenantSlug('tenant-1');

      expect(result).toBe('demo');
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT slug FROM tenants'),
        ['tenant-1'],
      );
    });

    it('returns null when tenant not found', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await repository.findTenantSlug('unknown-tenant');

      expect(result).toBeNull();
    });
  });
});
