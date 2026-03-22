import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AdminHealthService } from './admin-health.service';

@Injectable()
export class AdminHealthJob {
  private readonly logger = new Logger(AdminHealthJob.name);

  constructor(private readonly adminHealthService: AdminHealthService) {}

  @Cron('0 8 * * *') // daily 08:00
  async runDailyHealthCheck(): Promise<void> {
    this.logger.log('Running daily tenant health check...');
    await this.adminHealthService.runInactivityCheck();
    this.logger.log('Daily tenant health check completed');
  }
}
