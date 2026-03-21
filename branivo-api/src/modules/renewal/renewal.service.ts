import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { RenewalRepository, RenewalStage } from './renewal.repository';
import { QUEUE_NOTIFICATIONS } from '../../infrastructure/queues/queue.module';
import { EmailService } from '../../infrastructure/email/email.service';

export const RENEWAL_JOB_RUN_DAILY_CHECK = 'renewal:daily-check';

const RENEWAL_STAGES: Record<RenewalStage, number> = {
  d_minus_30: 30,
  d_minus_7: 7,
  d_minus_3: 3,
  d_minus_1: 1,
  d_plus_1: -1,
};

@Injectable()
export class RenewalService {
  private readonly logger = new Logger(RenewalService.name);

  constructor(
    private readonly renewalRepository: RenewalRepository,
    @InjectQueue(QUEUE_NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async runDailyCheck(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const [stage, daysOffset] of Object.entries(RENEWAL_STAGES) as [
      RenewalStage,
      number,
    ][]) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysOffset);
      await this.processStage(stage, targetDate, today);
    }
  }

  private async processStage(
    stage: RenewalStage,
    targetDate: Date,
    today: Date,
  ): Promise<void> {
    const policies =
      await this.renewalRepository.findExpiringPolicies(targetDate);

    this.logger.log(
      `Renewal stage ${stage}: found ${policies.length} expiring policies for ${targetDate.toISOString().slice(0, 10)}`,
    );

    for (const policy of policies) {
      const alreadyQueued =
        await this.renewalRepository.hasNotificationBeenQueued(
          policy.id,
          stage,
        );
      if (alreadyQueued) {
        this.logger.debug(
          `Renewal stage ${stage}: skipping policy ${policy.id} — already queued`,
        );
        continue;
      }

      // Check escalation stop for stages after d_minus_30
      if (stage !== 'd_minus_30' && policy.vehicle_id !== null) {
        const renewed = await this.renewalRepository.isPolicyRenewed(
          policy.vehicle_id,
          policy.coverage_end_date,
        );
        if (renewed) {
          this.logger.log(
            `Renewal stage ${stage}: skipping policy ${policy.id} — policy already renewed`,
          );
          continue;
        }
      }

      const todayStr = today.toISOString().slice(0, 10);
      await this.notificationsQueue.add(
        'notification:renewal',
        {
          policyId: policy.id,
          stage,
          tenantId: policy.tenant_id,
          coverageEndDate: policy.coverage_end_date,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          jobId: `renewal:${policy.id}:${stage}:${todayStr}`,
        },
      );

      await this.renewalRepository.recordQueuedNotification(
        policy.tenant_id,
        policy.id,
        stage,
      );

      this.logger.log(
        `Renewal stage ${stage}: queued notification for policy ${policy.id}`,
      );
    }
  }

  async notifySuperAdminOnFailure(error: Error): Promise<void> {
    const superAdminEmail =
      this.config.get<string>('SUPER_ADMIN_EMAIL') ?? 'admin@branivo.com';

    try {
      await this.emailService.sendRenewalFailureAlert({
        to: superAdminEmail,
        errorMessage: error.message,
      });
    } catch (emailErr) {
      this.logger.error(
        `Failed to send super admin renewal alert email`,
        emailErr instanceof Error ? emailErr.stack : String(emailErr),
      );
      return;
    }

    this.logger.warn(
      `Super admin renewal alert sent — error="${error.message}"`,
    );
  }
}
