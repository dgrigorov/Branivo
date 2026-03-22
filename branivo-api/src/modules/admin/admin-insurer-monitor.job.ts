import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AdminInsurerMonitorService } from './admin-insurer-monitor.service';

@Injectable()
export class AdminInsurerMonitorJob {
  private readonly logger = new Logger(AdminInsurerMonitorJob.name);

  constructor(
    private readonly adminInsurerMonitorService: AdminInsurerMonitorService,
  ) {}

  @Cron('*/5 * * * *') // всеки 5 минути — NFR48
  async runErrorRateCheck(): Promise<void> {
    this.logger.log('Running insurer API error rate check...');
    await this.adminInsurerMonitorService.runErrorRateCheck();
    this.logger.log('Insurer API error rate check completed');
  }
}
