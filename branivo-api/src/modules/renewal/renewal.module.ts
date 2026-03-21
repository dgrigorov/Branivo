import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { RenewalService, RENEWAL_JOB_RUN_DAILY_CHECK } from './renewal.service';
import { RenewalRepository } from './renewal.repository';
import { RenewalCheckProcessor } from './processors/renewal-check.processor';
import { RenewalNotificationLog } from './entities/renewal-notification-log.entity';
import { EmailModule } from '../../infrastructure/email/email.module';
import { QUEUE_NOTIFICATIONS } from '../../infrastructure/queues/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RenewalNotificationLog]),
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
    EmailModule,
  ],
  providers: [RenewalService, RenewalRepository, RenewalCheckProcessor],
})
export class RenewalModule implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUE_NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.notificationsQueue.add(
      RENEWAL_JOB_RUN_DAILY_CHECK,
      {},
      {
        repeat: { cron: '0 8 * * *', tz: 'Europe/Sofia' },
        jobId: 'daily-renewal-check',
      },
    );
  }
}
