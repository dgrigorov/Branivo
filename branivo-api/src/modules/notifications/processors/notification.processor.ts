import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { QUEUE_NOTIFICATIONS } from '../../../infrastructure/queues/queue.module';
import {
  NotificationsService,
  RenewalNotificationJobData,
} from '../notifications.service';

@Processor(QUEUE_NOTIFICATIONS)
export class NotificationProcessor {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Process('notification:renewal')
  async handleRenewalNotification(
    job: Job<RenewalNotificationJobData>,
  ): Promise<void> {
    await this.notificationsService.deliverRenewalNotification(job.data);
  }
}
