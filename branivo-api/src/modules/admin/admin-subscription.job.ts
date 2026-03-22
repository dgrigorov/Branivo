import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AdminSubscriptionService } from './admin-subscription.service';

@Injectable()
export class AdminSubscriptionJob {
  private readonly logger = new Logger(AdminSubscriptionJob.name);

  constructor(
    private readonly adminSubscriptionService: AdminSubscriptionService,
  ) {}

  @Cron('0 1 * * *') // 01:00 UTC всяка нощ
  async handlePendingDowngrades(): Promise<void> {
    this.logger.log('Running pending downgrade enforcement...');
    try {
      await this.adminSubscriptionService.enforcePendingDowngrades();
      this.logger.log('Pending downgrade enforcement completed');
    } catch (err) {
      this.logger.error('Pending downgrade enforcement failed', err);
    }
  }
}
