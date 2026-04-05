import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  NotificationsService,
  RenewalNotificationJobData,
} from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { PushChannel } from './channels/push.channel';
import { SmsChannel } from './channels/sms.channel';
import { EmailChannel } from './channels/email.channel';
import { WebPushChannel } from './channels/web-push.channel';
import { PushSubscriptionRepository } from './repositories/push-subscription.repository';
import { EmailService } from '../../infrastructure/email/email.service';
import { StageConfig } from './entities/tenant-renewal-config.entity';

const mockEndClient = {
  id: 'client-1',
  email: 'client@example.com',
  push_token: 'token-abc',
  phone_number: '+359888000000',
  first_name: 'Demo',
};

const mockRepo = {
  logNotification: jest.fn().mockResolvedValue(undefined),
  findEndClientForPolicy: jest.fn().mockResolvedValue(mockEndClient),
  findTenantDomain: jest.fn().mockResolvedValue('demo.branivo.com'),
  findTenantSlug: jest.fn().mockResolvedValue('demo'),
  findBrokerAdminEmail: jest.fn().mockResolvedValue('broker@example.com'),
  findTenantRenewalConfig: jest.fn().mockResolvedValue(null),
  upsertTenantRenewalConfig: jest.fn().mockResolvedValue(null),
  findTenantLogoUrl: jest.fn().mockResolvedValue(null),
};

const mockWebPush = {
  send: jest.fn().mockResolvedValue({
    status: 'sent',
    endpoint: 'https://push.example.com/sub/abc',
  }),
};

const mockPushSubRepo = {
  findByCustomerId: jest.fn().mockResolvedValue([]),
  deleteByEndpoint: jest.fn().mockResolvedValue(undefined),
};

const mockPush = {
  send: jest.fn().mockResolvedValue({ status: 'sent' }),
};

const mockSms = {
  send: jest.fn().mockResolvedValue({ status: 'sent', fallbackUsed: false }),
};

const mockEmail = {
  send: jest.fn().mockResolvedValue(undefined),
};

const mockEmailService = {
  sendRenewalFailureAlert: jest.fn().mockResolvedValue(undefined),
};

const mockManager = {
  query: jest.fn().mockResolvedValue(undefined),
};

const mockDataSource = {
  transaction: jest
    .fn()
    .mockImplementation(
      async (cb: (manager: typeof mockManager) => Promise<void>) => {
        await cb(mockManager);
      },
    ),
};

const BASE_DATA: RenewalNotificationJobData = {
  policyId: 'policy-1',
  stage: 'd_minus_30',
  tenantId: 'tenant-1',
  coverageEndDate: '2026-05-01T00:00:00.000Z',
};

const CUSTOM_STAGES: StageConfig[] = [
  { stage: 'd_minus_30', channels: ['push'], enabled: true },
  { stage: 'd_minus_7', channels: ['push'], enabled: true },
  { stage: 'd_minus_3', channels: ['sms'], enabled: false },
  { stage: 'd_minus_1', channels: ['email'], enabled: true },
  { stage: 'd_plus_1', channels: ['dashboard'], enabled: true },
];

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findEndClientForPolicy.mockResolvedValue(mockEndClient);
    mockRepo.findTenantDomain.mockResolvedValue('demo.branivo.com');
    mockRepo.findTenantSlug.mockResolvedValue('demo');
    mockRepo.findBrokerAdminEmail.mockResolvedValue('broker@example.com');
    mockRepo.findTenantRenewalConfig.mockResolvedValue(null);
    mockRepo.upsertTenantRenewalConfig.mockResolvedValue(null);
    mockPush.send.mockResolvedValue({ status: 'sent' });
    mockSms.send.mockResolvedValue({ status: 'sent', fallbackUsed: false });
    mockEmail.send.mockResolvedValue(undefined);
    mockWebPush.send.mockResolvedValue({
      status: 'sent',
      endpoint: 'https://push.example.com/sub/abc',
    });
    mockPushSubRepo.findByCustomerId.mockResolvedValue([]);
    mockPushSubRepo.deleteByEndpoint.mockResolvedValue(undefined);
    mockRepo.findTenantLogoUrl.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: mockRepo },
        { provide: PushChannel, useValue: mockPush },
        { provide: WebPushChannel, useValue: mockWebPush },
        { provide: PushSubscriptionRepository, useValue: mockPushSubRepo },
        { provide: SmsChannel, useValue: mockSms },
        { provide: EmailChannel, useValue: mockEmail },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
        { provide: EmailService, useValue: mockEmailService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('deliverRenewalNotification()', () => {
    it('d_minus_30 → push sent (platform default)', async () => {
      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_30',
      });

      expect(mockPush.send).toHaveBeenCalledWith(
        expect.objectContaining({ pushToken: 'token-abc' }),
      );
      expect(mockRepo.logNotification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'push', status: 'sent' }),
      );
    });

    it('d_minus_30, push_token null → push_skipped', async () => {
      mockRepo.findEndClientForPolicy.mockResolvedValue({
        ...mockEndClient,
        push_token: null,
      });
      mockPush.send.mockResolvedValue({ status: 'push_skipped' });

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_30',
      });

      expect(mockRepo.logNotification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'push', status: 'push_skipped' }),
      );
    });

    it('d_minus_3, Twilio fails → logs sms_failed + separate email log entry', async () => {
      mockSms.send.mockResolvedValue({
        status: 'sms_failed',
        fallbackUsed: true,
      });

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_3',
      });

      expect(mockRepo.logNotification).toHaveBeenCalledTimes(2);
      expect(mockRepo.logNotification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'sms', status: 'sms_failed' }),
      );
      expect(mockRepo.logNotification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'email', status: 'sent' }),
      );
    });

    it('d_minus_3, SMS success → single log entry (no fallback)', async () => {
      mockSms.send.mockResolvedValue({ status: 'sent', fallbackUsed: false });

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_3',
      });

      expect(mockRepo.logNotification).toHaveBeenCalledTimes(1);
      expect(mockRepo.logNotification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'sms', status: 'sent' }),
      );
    });

    it('d_minus_1 → email sent', async () => {
      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_1',
      });

      expect(mockEmail.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'client@example.com' }),
      );
      expect(mockRepo.logNotification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'email', status: 'sent' }),
      );
    });

    it('d_minus_1, email throws → status failed + Super Admin alert', async () => {
      mockEmail.send.mockRejectedValue(new Error('SMTP connection failed'));

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_1',
      });

      expect(mockRepo.logNotification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'email', status: 'failed' }),
      );
      expect(mockEmailService.sendRenewalFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({ errorMessage: 'SMTP connection failed' }),
      );
    });

    it('d_plus_1 → notifyBroker sends email to broker admin', async () => {
      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_plus_1',
      });

      expect(mockEmail.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'broker@example.com' }),
      );
      expect(mockRepo.logNotification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'dashboard', status: 'sent' }),
      );
    });

    it('d_plus_1, no broker email → status failed', async () => {
      mockRepo.findBrokerAdminEmail.mockResolvedValue(null);

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_plus_1',
      });

      expect(mockRepo.logNotification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'dashboard', status: 'failed' }),
      );
    });

    it('renewal link format: https://{domain}/renewal/{policyId}', async () => {
      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_1',
      });

      expect(mockEmail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(
            'https://demo.branivo.com/renewal/policy-1',
          ) as string,
        }),
      );
    });

    it('no primary domain → falls back to {slug}.branivo.bg (H1)', async () => {
      mockRepo.findTenantDomain.mockResolvedValue(null);
      mockRepo.findTenantSlug.mockResolvedValue('acme');

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_1',
      });

      expect(mockEmail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(
            'https://acme.branivo.bg/renewal/policy-1',
          ) as string,
        }),
      );
    });

    // AC2 — tenant-specific config used when available
    it('uses tenant config channels when present (AC2)', async () => {
      mockRepo.findTenantRenewalConfig.mockResolvedValue(CUSTOM_STAGES);

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_30',
      });

      expect(mockPush.send).toHaveBeenCalled();
      expect(mockRepo.logNotification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'push', status: 'sent' }),
      );
    });

    // AC3 — platform default used when no tenant config
    it('falls back to platform default when no tenant config (AC3)', async () => {
      mockRepo.findTenantRenewalConfig.mockResolvedValue(null);

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_30',
      });

      expect(mockPush.send).toHaveBeenCalled();
    });

    // AC5 — disabled stage is skipped without error
    it('disabled stage in tenant config → skips without error (AC5)', async () => {
      mockRepo.findTenantRenewalConfig.mockResolvedValue(CUSTOM_STAGES);

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_3',
      });

      expect(mockSms.send).not.toHaveBeenCalled();
      expect(mockRepo.logNotification).not.toHaveBeenCalled();
    });

    // Story 22.4 — Web Push dispatch tests (AC3, AC4, AC5)
    it('web push sent за активен subscription → логва channel web_push, status sent (AC3)', async () => {
      mockPushSubRepo.findByCustomerId.mockResolvedValue([
        {
          endpoint: 'https://push.example.com/sub/abc',
          p256dh: 'key123',
          auth: 'auth123',
          type: 'web',
          tenantId: 'tenant-1',
        },
      ]);
      mockWebPush.send.mockResolvedValue({
        status: 'sent',
        endpoint: 'https://push.example.com/sub/abc',
      });

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_30',
      });

      expect(mockWebPush.send).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://push.example.com/sub/abc',
        }),
        expect.objectContaining({ title: 'Подновяване на полица' }),
      );
      expect(mockRepo.logNotification).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'web_push', status: 'sent' }),
      );
    });

    it('web push 410 expired → deleteByEndpoint + логва push_skipped (AC4)', async () => {
      mockPushSubRepo.findByCustomerId.mockResolvedValue([
        {
          endpoint: 'https://push.example.com/sub/expired',
          p256dh: 'key123',
          auth: 'auth123',
          type: 'web',
          tenantId: 'tenant-1',
        },
      ]);
      mockWebPush.send.mockResolvedValue({
        status: 'expired',
        endpoint: 'https://push.example.com/sub/expired',
      });

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_30',
      });

      expect(mockPushSubRepo.deleteByEndpoint).toHaveBeenCalledWith(
        'https://push.example.com/sub/expired',
        'tenant-1',
      );
      expect(mockRepo.logNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'web_push',
          status: 'push_skipped',
        }),
      );
    });

    it('no web push subscriptions → webPushChannel.send не се извиква (AC3)', async () => {
      mockPushSubRepo.findByCustomerId.mockResolvedValue([]);

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_30',
      });

      expect(mockWebPush.send).not.toHaveBeenCalled();
    });

    it('web push icon = tenant logo_url от TenantContext (AC3)', async () => {
      mockRepo.findTenantLogoUrl.mockResolvedValue(
        'https://cdn.branivo.bg/logo.png',
      );
      mockPushSubRepo.findByCustomerId.mockResolvedValue([
        {
          endpoint: 'https://push.example.com/sub/abc',
          p256dh: 'key',
          auth: 'auth',
          type: 'web',
          tenantId: 'tenant-1',
        },
      ]);

      await service.deliverRenewalNotification({
        ...BASE_DATA,
        stage: 'd_minus_30',
      });

      expect(mockWebPush.send).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ icon: 'https://cdn.branivo.bg/logo.png' }),
      );
    });
  });

  describe('notifyBroker()', () => {
    it('sends real email to broker admin and returns true', async () => {
      const sent = await service.notifyBroker({
        tenantId: 'tenant-1',
        subject: 'Test Subject',
        message: 'Test message',
      });

      expect(sent).toBe(true);
      expect(mockEmail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'broker@example.com',
          subject: 'Test Subject',
        }),
      );
    });

    it('returns false when no broker admin email found', async () => {
      mockRepo.findBrokerAdminEmail.mockResolvedValue(null);

      const sent = await service.notifyBroker({
        tenantId: 'tenant-1',
        subject: 'Test',
        message: 'Test',
      });

      expect(sent).toBe(false);
      expect(mockEmail.send).not.toHaveBeenCalled();
    });
  });

  describe('getTenantRenewalConfig()', () => {
    it('returns DB config with isDefault: false when config exists (AC6)', async () => {
      mockRepo.findTenantRenewalConfig.mockResolvedValue(CUSTOM_STAGES);

      const result = await service.getTenantRenewalConfig('tenant-1');

      expect(result.tenantId).toBe('tenant-1');
      expect(result.isDefault).toBe(false);
      expect(result.stages).toEqual(CUSTOM_STAGES);
    });

    it('returns platform default with isDefault: true when no config (AC6)', async () => {
      mockRepo.findTenantRenewalConfig.mockResolvedValue(null);

      const result = await service.getTenantRenewalConfig('tenant-1');

      expect(result.tenantId).toBe('tenant-1');
      expect(result.isDefault).toBe(true);
      expect(result.stages).toHaveLength(5);
    });
  });

  describe('upsertTenantRenewalConfig()', () => {
    it('writes audit log with old_config and new_config (AC4)', async () => {
      const oldStages: StageConfig[] = [
        { stage: 'd_minus_30', channels: ['push'], enabled: true },
      ];
      mockRepo.upsertTenantRenewalConfig.mockResolvedValue(oldStages);

      const dto = { stages: CUSTOM_STAGES };
      await service.upsertTenantRenewalConfig('tenant-1', dto, 'admin-user-id');

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        expect.arrayContaining([
          'tenant-1',
          'admin-user-id',
          'renewal_config.updated',
          'tenant',
          'tenant-1',
          expect.stringContaining('old_config') as string,
        ]),
      );
    });

    it('returns updated config with isDefault: false (AC7)', async () => {
      mockRepo.upsertTenantRenewalConfig.mockResolvedValue(null);

      const dto = { stages: CUSTOM_STAGES };
      const result = await service.upsertTenantRenewalConfig(
        'tenant-1',
        dto,
        'admin-user-id',
      );

      expect(result.tenantId).toBe('tenant-1');
      expect(result.isDefault).toBe(false);
      expect(result.stages).toEqual(CUSTOM_STAGES);
    });
  });
});
