import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationsRepository,
  EndClientRow,
} from './notifications.repository';
import { PushChannel } from './channels/push.channel';
import { SmsChannel } from './channels/sms.channel';
import { EmailChannel } from './channels/email.channel';
import {
  NotificationChannel,
  NotificationStatus,
} from './entities/notification-log.entity';
import { RenewalStage } from '../renewal/renewal.repository';
import { EmailService } from '../../infrastructure/email/email.service';

export type { RenewalStage };

export interface RenewalNotificationJobData {
  policyId: string;
  stage: RenewalStage;
  tenantId: string;
  coverageEndDate: string; // ISO string — Dates не се сериализират в BullMQ
}

// TODO (Story 6.3): Replace DEFAULT_CHANNEL_MAP with tenant-specific config from DB
const DEFAULT_CHANNEL_MAP: Record<RenewalStage, NotificationChannel> = {
  d_minus_30: 'push',
  d_minus_7: 'push',
  d_minus_3: 'sms',
  d_minus_1: 'email',
  d_plus_1: 'dashboard',
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly pushChannel: PushChannel,
    private readonly smsChannel: SmsChannel,
    private readonly emailChannel: EmailChannel,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async notifyBroker(params: {
    tenantId: string;
    subject: string;
    message: string;
  }): Promise<boolean> {
    const brokerEmail = await this.notificationsRepository.findBrokerAdminEmail(
      params.tenantId,
    );
    if (!brokerEmail) {
      this.logger.warn(
        `No broker admin email for tenant ${params.tenantId} — skipping broker notification`,
      );
      return false;
    }
    await this.emailChannel.send({
      to: brokerEmail,
      subject: params.subject,
      html: `<p>${params.message}</p>`,
      tenantName: 'Branivo',
    });
    return true;
  }

  async deliverRenewalNotification(
    data: RenewalNotificationJobData,
  ): Promise<void> {
    const { policyId, stage, tenantId, coverageEndDate } = data;

    const endClient =
      await this.notificationsRepository.findEndClientForPolicy(policyId);
    const domain =
      (await this.notificationsRepository.findTenantDomain(tenantId)) ??
      'branivo.com';
    const renewalLink = `https://${domain}/renewal/${policyId}`;
    const expiryDate = new Date(coverageEndDate).toLocaleDateString('bg-BG');
    const channel = DEFAULT_CHANNEL_MAP[stage];

    if (channel === 'sms') {
      await this.deliverSmsWithFallbackLog(
        endClient,
        expiryDate,
        renewalLink,
        tenantId,
        policyId,
        stage,
      );
      return;
    }

    const status = await this.dispatchByChannel(
      channel,
      endClient,
      tenantId,
      policyId,
      coverageEndDate,
      expiryDate,
      renewalLink,
    );
    await this.notificationsRepository.logNotification({
      tenantId,
      policyId,
      stage,
      channel,
      status,
      deliveredAt: status === 'sent' ? new Date() : null,
    });
  }

  private async deliverSmsWithFallbackLog(
    endClient: EndClientRow | null,
    expiryDate: string,
    renewalLink: string,
    tenantId: string,
    policyId: string,
    stage: RenewalStage,
  ): Promise<void> {
    const result = await this.smsChannel.send({
      phoneNumber: endClient?.phone_number ?? '',
      message: `ГО изтича ${expiryDate}. Поднови: ${renewalLink}`,
      fallbackEmail: endClient?.email ?? null,
      emailSubject: 'Напомняне за подновяване на полица',
      emailBody: this.buildRenewalEmailHtml(expiryDate, renewalLink),
      tenantName: 'Branivo',
    });
    await this.notificationsRepository.logNotification({
      tenantId,
      policyId,
      stage,
      channel: 'sms',
      status: result.status,
      deliveredAt: null,
    });
    if (result.fallbackUsed) {
      await this.notificationsRepository.logNotification({
        tenantId,
        policyId,
        stage,
        channel: 'email',
        status: 'sent',
        deliveredAt: new Date(),
      });
    }
  }

  private async dispatchByChannel(
    channel: Exclude<NotificationChannel, 'sms'>,
    endClient: EndClientRow | null,
    tenantId: string,
    policyId: string,
    coverageEndDate: string,
    expiryDate: string,
    renewalLink: string,
  ): Promise<NotificationStatus> {
    if (channel === 'push')
      return this.sendPush(endClient, expiryDate, renewalLink);
    if (channel === 'email')
      return this.sendEmail(endClient, expiryDate, renewalLink);
    return this.sendDashboard(tenantId, policyId, coverageEndDate);
  }

  private async sendPush(
    endClient: EndClientRow | null,
    expiryDate: string,
    renewalLink: string,
  ): Promise<NotificationStatus> {
    const result = await this.pushChannel.send({
      pushToken: endClient?.push_token ?? null,
      title: 'Подновяване на полица',
      body: `Вашата ГО полица изтича на ${expiryDate}. Поднови сега → ${renewalLink}`,
    });
    return result.status;
  }

  private async sendEmail(
    endClient: EndClientRow | null,
    expiryDate: string,
    renewalLink: string,
  ): Promise<NotificationStatus> {
    if (!endClient?.email) {
      this.logger.warn(`No email for end client — skipping email notification`);
      return 'failed';
    }
    try {
      await this.emailChannel.send({
        to: endClient.email,
        subject: 'Напомняне: Вашата ГО полица изтича утре',
        html: this.buildRenewalEmailHtml(expiryDate, renewalLink),
        tenantName: 'Branivo',
      });
      return 'sent';
    } catch (err) {
      this.logger.error('Email notification failed permanently', err);
      const adminEmail =
        this.config.get<string>('SUPER_ADMIN_EMAIL') ?? 'admin@branivo.com';
      await this.emailService.sendRenewalFailureAlert({
        to: adminEmail,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return 'failed';
    }
  }

  private async sendDashboard(
    tenantId: string,
    policyId: string,
    coverageEndDate: string,
  ): Promise<NotificationStatus> {
    const expiryDate = new Date(coverageEndDate).toLocaleDateString('bg-BG');
    const sent = await this.notifyBroker({
      tenantId,
      subject: `Неподновена полица — ${expiryDate}`,
      message: `Полица <strong>${policyId}</strong> не е подновена. Дата на изтичане: ${expiryDate}.`,
    });
    return sent ? 'sent' : 'failed';
  }

  private buildRenewalEmailHtml(
    expiryDate: string,
    renewalLink: string,
  ): string {
    const safeDate = expiryDate
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const safeLink = renewalLink.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    return `
      <h2>Напомняне за подновяване на полица</h2>
      <p>Вашата ГО полица изтича на <strong>${safeDate}</strong>.</p>
      <p><a href="${safeLink}">Поднови сега</a></p>
      <p>— Branivo Platform</p>
    `;
  }
}
