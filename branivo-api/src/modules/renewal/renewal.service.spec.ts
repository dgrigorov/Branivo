import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { RenewalService, RENEWAL_JOB_RUN_DAILY_CHECK } from './renewal.service';
import { RenewalRepository, ExpiringPolicyRow } from './renewal.repository';
import { EmailService } from '../../infrastructure/email/email.service';
import { QUEUE_NOTIFICATIONS } from '../../infrastructure/queues/queue.module';

type NotificationAddArgs = [
  string,
  {
    policyId: string;
    stage: string;
    tenantId: string;
    coverageEndDate: Date;
  },
  {
    attempts: number;
    backoff: { type: string; delay: number };
    jobId: string;
  },
];

const mockRenewalRepo = {
  findExpiringPolicies: jest.fn<Promise<ExpiringPolicyRow[]>, [Date]>(),
  hasNotificationBeenQueued: jest.fn<Promise<boolean>, [string, string]>(),
  isPolicyRenewed: jest.fn<Promise<boolean>, [string, Date]>(),
  recordQueuedNotification: jest.fn<Promise<void>, [string, string, string]>(),
};

const mockNotificationsQueue = { add: jest.fn() };
const mockEmailService = { sendRenewalFailureAlert: jest.fn() };
const mockConfigService = {
  get: jest.fn<string, [string]>().mockReturnValue('admin@branivo.com'),
};

function makePolicy(
  overrides: Partial<ExpiringPolicyRow> = {},
): ExpiringPolicyRow {
  return {
    id: 'policy-uuid-1',
    tenant_id: 'tenant-uuid-1',
    vehicle_id: 'vehicle-uuid-1',
    coverage_end_date: new Date('2026-04-20'),
    end_client_id: 'client-uuid-1',
    ...overrides,
  };
}

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

describe('RenewalService', () => {
  let service: RenewalService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RenewalService,
        { provide: RenewalRepository, useValue: mockRenewalRepo },
        {
          provide: getQueueToken(QUEUE_NOTIFICATIONS),
          useValue: mockNotificationsQueue,
        },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<RenewalService>(RenewalService);
  });

  describe('runDailyCheck()', () => {
    it('calls findExpiringPolicies for all 5 renewal stages', async () => {
      mockRenewalRepo.findExpiringPolicies.mockResolvedValue([]);

      await service.runDailyCheck();

      expect(mockRenewalRepo.findExpiringPolicies).toHaveBeenCalledTimes(5);
    });

    it('queues notification for d_minus_30 policy with correct job params', async () => {
      const policy = makePolicy();
      const today = todayMidnight();
      const d30 = addDays(today, 30);

      mockRenewalRepo.findExpiringPolicies.mockImplementation(
        (targetDate: Date) => {
          if (
            targetDate.toISOString().slice(0, 10) ===
            d30.toISOString().slice(0, 10)
          ) {
            return Promise.resolve([policy]);
          }
          return Promise.resolve([]);
        },
      );
      mockRenewalRepo.hasNotificationBeenQueued.mockResolvedValue(false);
      mockRenewalRepo.recordQueuedNotification.mockResolvedValue(undefined);

      await service.runDailyCheck();

      const addCalls = mockNotificationsQueue.add.mock
        .calls as NotificationAddArgs[];
      const renewalCall = addCalls.find(
        ([name, data]) =>
          name === 'notification:renewal' && data.stage === 'd_minus_30',
      );
      expect(renewalCall).toBeDefined();
      if (!renewalCall) return;

      const [jobName, jobData, jobOpts] = renewalCall;
      expect(jobName).toBe('notification:renewal');
      expect(jobData.policyId).toBe(policy.id);
      expect(jobData.stage).toBe('d_minus_30');
      expect(jobData.tenantId).toBe(policy.tenant_id);
      expect(jobOpts.attempts).toBe(3);
      expect(jobOpts.backoff).toEqual({ type: 'exponential', delay: 5000 });
      expect(jobOpts.jobId).toMatch(
        /^renewal:policy-uuid-1:d_minus_30:\d{4}-\d{2}-\d{2}$/,
      );
    });

    it('skips policy already in renewal_notification_log (idempotency)', async () => {
      const policy = makePolicy();
      mockRenewalRepo.findExpiringPolicies.mockResolvedValue([policy]);
      mockRenewalRepo.hasNotificationBeenQueued.mockResolvedValue(true);

      await service.runDailyCheck();

      expect(mockNotificationsQueue.add).not.toHaveBeenCalledWith(
        'notification:renewal',
        expect.anything(),
        expect.anything(),
      );
    });

    it('skips policy that is already renewed at d_minus_7', async () => {
      const policy = makePolicy();
      const today = todayMidnight();
      const d7 = addDays(today, 7);

      mockRenewalRepo.findExpiringPolicies.mockImplementation(
        (targetDate: Date) => {
          if (
            targetDate.toISOString().slice(0, 10) ===
            d7.toISOString().slice(0, 10)
          ) {
            return Promise.resolve([policy]);
          }
          return Promise.resolve([]);
        },
      );
      mockRenewalRepo.hasNotificationBeenQueued.mockResolvedValue(false);
      mockRenewalRepo.isPolicyRenewed.mockResolvedValue(true);

      await service.runDailyCheck();

      expect(mockNotificationsQueue.add).not.toHaveBeenCalledWith(
        'notification:renewal',
        expect.objectContaining({ stage: 'd_minus_7' }),
        expect.anything(),
      );
    });

    it('queues d_plus_1 stage job correctly for expired policy', async () => {
      const policy = makePolicy({ coverage_end_date: new Date('2026-03-20') });
      const today = todayMidnight();
      const dPlus1 = addDays(today, -1);

      mockRenewalRepo.findExpiringPolicies.mockImplementation(
        (targetDate: Date) => {
          if (
            targetDate.toISOString().slice(0, 10) ===
            dPlus1.toISOString().slice(0, 10)
          ) {
            return Promise.resolve([policy]);
          }
          return Promise.resolve([]);
        },
      );
      mockRenewalRepo.hasNotificationBeenQueued.mockResolvedValue(false);
      mockRenewalRepo.isPolicyRenewed.mockResolvedValue(false);
      mockRenewalRepo.recordQueuedNotification.mockResolvedValue(undefined);

      await service.runDailyCheck();

      const addCalls = mockNotificationsQueue.add.mock
        .calls as NotificationAddArgs[];
      const dPlus1Call = addCalls.find(([, data]) => data.stage === 'd_plus_1');
      expect(dPlus1Call).toBeDefined();
    });

    it('skips isPolicyRenewed check for d_minus_30 stage', async () => {
      const policy = makePolicy();
      const today = todayMidnight();
      const d30 = addDays(today, 30);

      mockRenewalRepo.findExpiringPolicies.mockImplementation(
        (targetDate: Date) => {
          if (
            targetDate.toISOString().slice(0, 10) ===
            d30.toISOString().slice(0, 10)
          ) {
            return Promise.resolve([policy]);
          }
          return Promise.resolve([]);
        },
      );
      mockRenewalRepo.hasNotificationBeenQueued.mockResolvedValue(false);
      mockRenewalRepo.recordQueuedNotification.mockResolvedValue(undefined);

      await service.runDailyCheck();

      expect(mockRenewalRepo.isPolicyRenewed).not.toHaveBeenCalled();
    });

    it('skips isPolicyRenewed check when vehicle_id is null', async () => {
      const policy = makePolicy({ vehicle_id: null });
      const today = todayMidnight();
      const d7 = addDays(today, 7);

      mockRenewalRepo.findExpiringPolicies.mockImplementation(
        (targetDate: Date) => {
          if (
            targetDate.toISOString().slice(0, 10) ===
            d7.toISOString().slice(0, 10)
          ) {
            return Promise.resolve([policy]);
          }
          return Promise.resolve([]);
        },
      );
      mockRenewalRepo.hasNotificationBeenQueued.mockResolvedValue(false);
      mockRenewalRepo.recordQueuedNotification.mockResolvedValue(undefined);

      await service.runDailyCheck();

      expect(mockRenewalRepo.isPolicyRenewed).not.toHaveBeenCalled();
    });

    it('uses correct jobId format: renewal:{policyId}:{stage}:{date}', async () => {
      const policy = makePolicy();
      const today = todayMidnight();
      const d3 = addDays(today, 3);
      const expectedDate = today.toISOString().slice(0, 10);

      mockRenewalRepo.findExpiringPolicies.mockImplementation(
        (targetDate: Date) => {
          if (
            targetDate.toISOString().slice(0, 10) ===
            d3.toISOString().slice(0, 10)
          ) {
            return Promise.resolve([policy]);
          }
          return Promise.resolve([]);
        },
      );
      mockRenewalRepo.hasNotificationBeenQueued.mockResolvedValue(false);
      mockRenewalRepo.isPolicyRenewed.mockResolvedValue(false);
      mockRenewalRepo.recordQueuedNotification.mockResolvedValue(undefined);

      await service.runDailyCheck();

      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'notification:renewal',
        expect.objectContaining({ stage: 'd_minus_3' }),
        expect.objectContaining({
          jobId: `renewal:${policy.id}:d_minus_3:${expectedDate}`,
        }),
      );
    });
  });

  describe('notifySuperAdminOnFailure()', () => {
    it('sends renewal failure alert email to super admin', async () => {
      mockEmailService.sendRenewalFailureAlert.mockResolvedValue(undefined);
      const error = new Error('BullMQ connection lost');

      await service.notifySuperAdminOnFailure(error);

      expect(mockEmailService.sendRenewalFailureAlert).toHaveBeenCalledWith({
        to: 'admin@branivo.com',
        errorMessage: 'BullMQ connection lost',
      });
    });

    it('logs error but does not rethrow when email fails', async () => {
      mockEmailService.sendRenewalFailureAlert.mockRejectedValue(
        new Error('SMTP down'),
      );
      const error = new Error('Renewal failure');

      await expect(
        service.notifySuperAdminOnFailure(error),
      ).resolves.not.toThrow();
    });
  });

  describe('RENEWAL_JOB_RUN_DAILY_CHECK constant', () => {
    it('is exported with correct value', () => {
      expect(RENEWAL_JOB_RUN_DAILY_CHECK).toBe('renewal:daily-check');
    });
  });
});
