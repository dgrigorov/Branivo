import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import {
  NotificationsRepository,
  EndClientRow,
} from './notifications.repository';
import { PushChannel } from './channels/push.channel';
import { SmsChannel } from './channels/sms.channel';
import { EmailChannel } from './channels/email.channel';
import { WebPushChannel } from './channels/web-push.channel';
import {
  NotificationChannel,
  NotificationStatus,
} from './entities/notification-log.entity';
import { StageConfig } from './entities/tenant-renewal-config.entity';
import { RenewalStage } from '../renewal/renewal.repository';
import { EmailService } from '../../infrastructure/email/email.service';
import { RenewalConfigResponseDto } from './dto/renewal-config-response.dto';
import { UpsertRenewalConfigDto } from './dto/upsert-renewal-config.dto';
import { PushSubscriptionRepository } from './repositories/push-subscription.repository';

export type { RenewalStage };

export interface RenewalNotificationJobData {
  policyId: string;
  stage: RenewalStage;
  tenantId: string;
  coverageEndDate: string; // ISO string — Dates не се сериализират в BullMQ
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  // PLATFORM DEFAULT — използва се когато няма tenant config
  private static readonly PLATFORM_DEFAULT_STAGES: StageConfig[] = [
    { stage: 'd_minus_30', channels: ['push'], enabled: true },
    { stage: 'd_minus_7', channels: ['push'], enabled: true },
    { stage: 'd_minus_3', channels: ['sms'], enabled: true },
    { stage: 'd_minus_1', channels: ['email'], enabled: true },
    { stage: 'd_plus_1', channels: ['dashboard'], enabled: true },
  ];

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly pushChannel: PushChannel,
    private readonly webPushChannel: WebPushChannel,
    private readonly pushSubscriptionRepository: PushSubscriptionRepository,
    private readonly smsChannel: SmsChannel,
    private readonly emailChannel: EmailChannel,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly dataSource: DataSource,
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

    // Load tenant config or fall back to platform default (AC3)
    const tenantStages =
      (await this.notificationsRepository.findTenantRenewalConfig(tenantId)) ??
      NotificationsService.PLATFORM_DEFAULT_STAGES;

    const stageConfig = tenantStages.find((s) => s.stage === stage);
    if (!stageConfig) {
      this.logger.log(
        `Stage ${stage} not configured for tenant ${tenantId} — skipping`,
      );
      return;
    }
    if (!stageConfig.enabled) {
      this.logger.log(
        `Stage ${stage} is disabled for tenant ${tenantId} — skipping`,
      );
      return;
    }

    const endClient =
      await this.notificationsRepository.findEndClientForPolicy(policyId);
    const customDomain =
      await this.notificationsRepository.findTenantDomain(tenantId);
    const domain =
      customDomain ??
      `${(await this.notificationsRepository.findTenantSlug(tenantId)) ?? tenantId}.branivo.bg`;
    const renewalLink = `https://${domain}/renewal/${policyId}`;
    const expiryDate = new Date(coverageEndDate).toLocaleDateString('bg-BG');

    // Execute channels in order — skip disabled channels (AC5)
    for (const channel of stageConfig.channels) {
      await this.dispatchChannel(
        channel,
        endClient,
        tenantId,
        policyId,
        coverageEndDate,
        expiryDate,
        renewalLink,
        stage,
      );
    }
  }

  async getTenantRenewalConfig(
    tenantId: string,
  ): Promise<RenewalConfigResponseDto> {
    const stages =
      await this.notificationsRepository.findTenantRenewalConfig(tenantId);
    return {
      tenantId,
      stages: stages ?? NotificationsService.PLATFORM_DEFAULT_STAGES,
      isDefault: stages === null,
    };
  }

  async upsertTenantRenewalConfig(
    tenantId: string,
    dto: UpsertRenewalConfigDto,
    superAdminId: string,
  ): Promise<RenewalConfigResponseDto> {
    const oldConfig =
      await this.notificationsRepository.upsertTenantRenewalConfig(
        tenantId,
        dto.stages,
      );
    await this.writeRenewalConfigAuditLog({
      tenantId,
      userId: superAdminId,
      oldConfig,
      newConfig: dto.stages,
    });
    return { tenantId, stages: dto.stages, isDefault: false };
  }

  private async writeRenewalConfigAuditLog(entry: {
    tenantId: string;
    userId: string;
    oldConfig: StageConfig[] | null;
    newConfig: StageConfig[];
  }): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager: EntityManager) => {
        await manager.query('SET LOCAL app.current_tenant_id = $1', [
          entry.tenantId,
        ]);
        await manager.query(
          `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            entry.tenantId,
            entry.userId,
            'renewal_config.updated',
            'tenant',
            entry.tenantId,
            JSON.stringify({
              old_config: entry.oldConfig,
              new_config: entry.newConfig,
            }),
          ],
        );
      });
    } catch (err) {
      this.logger.error(
        'Failed to write audit log for renewal config change',
        err,
      );
    }
  }

  private async dispatchChannel(
    channel: NotificationChannel,
    endClient: EndClientRow | null,
    tenantId: string,
    policyId: string,
    coverageEndDate: string,
    expiryDate: string,
    renewalLink: string,
    stage: RenewalStage,
  ): Promise<void> {
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
      stage,
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
    stage: RenewalStage,
  ): Promise<NotificationStatus> {
    if (channel === 'push')
      return this.sendPush(
        endClient,
        expiryDate,
        renewalLink,
        tenantId,
        policyId,
        stage,
      );
    if (channel === 'email')
      return this.sendEmail(endClient, expiryDate, renewalLink);
    return this.sendDashboard(tenantId, policyId, coverageEndDate);
  }

  private async sendPush(
    endClient: EndClientRow | null,
    expiryDate: string,
    renewalLink: string,
    tenantId: string,
    policyId: string,
    stage: RenewalStage,
  ): Promise<NotificationStatus> {
    const fcmResult = await this.pushChannel.send({
      pushToken: endClient?.push_token ?? null,
      title: 'Подновяване на полица',
      body: `Вашата ГО полица изтича на ${expiryDate}. Поднови сега → ${renewalLink}`,
    });

    if (endClient) {
      await this.sendWebPush(
        endClient.id,
        tenantId,
        policyId,
        stage,
        expiryDate,
        renewalLink,
      );
    }

    return fcmResult.status;
  }

  private async sendWebPush(
    customerId: string,
    tenantId: string,
    policyId: string,
    stage: RenewalStage,
    expiryDate: string,
    renewalLink: string,
  ): Promise<void> {
    const subscriptions =
      await this.pushSubscriptionRepository.findByCustomerId(customerId);
    const webSubs = subscriptions.filter((s) => s.type === 'web');
    if (webSubs.length === 0) return;

    const logoUrl =
      await this.notificationsRepository.findTenantLogoUrl(tenantId);
    const payload = {
      title: 'Подновяване на полица',
      body: `Вашата ГО полица изтича на ${expiryDate}. Поднови сега`,
      icon: logoUrl ?? undefined,
      url: renewalLink,
    };

    for (const sub of webSubs) {
      const result = await this.webPushChannel.send(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
      );

      if (result.status === 'expired') {
        await this.pushSubscriptionRepository.deleteByEndpoint(
          sub.endpoint,
          tenantId,
        );
        await this.notificationsRepository.logNotification({
          tenantId,
          policyId,
          stage,
          channel: 'web_push' as NotificationChannel,
          status: 'push_skipped',
          deliveredAt: null,
        });
      } else {
        await this.notificationsRepository.logNotification({
          tenantId,
          policyId,
          stage,
          channel: 'web_push' as NotificationChannel,
          status: 'sent',
          deliveredAt: new Date(),
        });
      }
    }
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
