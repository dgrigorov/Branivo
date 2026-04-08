import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { DataBreachService, BreachAlertType } from './data-breach.service';

const ALERT_DEDUP_TTL_SECONDS = 4 * 60 * 60; // 4 hours

@Injectable()
export class DataBreachAlertJob {
  private readonly logger = new Logger(DataBreachAlertJob.name);

  constructor(
    private readonly dataBreachService: DataBreachService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Cron('0 */4 * * *')
  async runBreachDeadlineAlerts(): Promise<void> {
    this.logger.log('Running data breach KZLD deadline alert check...');

    const breaches = await this.dataBreachService.getPendingAlertBreaches();
    const now = new Date();

    for (const breach of breaches) {
      const hoursLeft = Math.floor(
        (breach.kzldNotificationDeadline.getTime() - now.getTime()) /
          (1000 * 60 * 60),
      );

      if (breach.kzldNotificationDeadline < now) {
        await this.sendDedupedAlert(
          breach.id,
          'data-breach-overdue',
          async () => {
            await this.dataBreachService.sendBreachAlert(
              'data-breach-overdue',
              breach,
            );
          },
        );
      } else if (hoursLeft <= 8) {
        await this.sendDedupedAlert(
          breach.id,
          'data-breach-8h-urgent',
          async () => {
            await this.dataBreachService.sendBreachAlert(
              'data-breach-8h-urgent',
              breach,
            );
          },
        );
      } else if (hoursLeft <= 24) {
        await this.sendDedupedAlert(
          breach.id,
          'data-breach-24h-warning',
          async () => {
            await this.dataBreachService.sendBreachAlert(
              'data-breach-24h-warning',
              breach,
            );
          },
        );
      }
    }

    this.logger.log(
      `Data breach deadline alert check complete. Processed ${breaches.length} active breaches.`,
    );
  }

  private async sendDedupedAlert(
    breachId: string,
    alertType: BreachAlertType,
    sendFn: () => Promise<void>,
  ): Promise<void> {
    const key = `breach-alert:${breachId}:${alertType}`;
    const alreadySent = await this.redis.get(key);

    if (alreadySent) {
      this.logger.debug(
        `Skipping duplicate alert [${alertType}] for breach ${breachId}`,
      );
      return;
    }

    await sendFn();
    await this.redis.set(key, '1', 'EX', ALERT_DEDUP_TTL_SECONDS);
  }
}
