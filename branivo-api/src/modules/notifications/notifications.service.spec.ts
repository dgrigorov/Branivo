import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  NotificationsService,
  RenewalNotificationJobData,
} from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { PushChannel } from './channels/push.channel';
import { SmsChannel } from './channels/sms.channel';
import { EmailChannel } from './channels/email.channel';
import { EmailService } from '../../infrastructure/email/email.service';

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
  findBrokerAdminEmail: jest.fn().mockResolvedValue('broker@example.com'),
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

const BASE_DATA: RenewalNotificationJobData = {
  policyId: 'policy-1',
  stage: 'd_minus_30',
  tenantId: 'tenant-1',
  coverageEndDate: '2026-05-01T00:00:00.000Z',
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepo.findEndClientForPolicy.mockResolvedValue(mockEndClient);
    mockRepo.findTenantDomain.mockResolvedValue('demo.branivo.com');
    mockRepo.findBrokerAdminEmail.mockResolvedValue('broker@example.com');
    mockPush.send.mockResolvedValue({ status: 'sent' });
    mockSms.send.mockResolvedValue({ status: 'sent', fallbackUsed: false });
    mockEmail.send.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: mockRepo },
        { provide: PushChannel, useValue: mockPush },
        { provide: SmsChannel, useValue: mockSms },
        { provide: EmailChannel, useValue: mockEmail },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('deliverRenewalNotification()', () => {
    it('d_minus_30 → push sent', async () => {
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
});
