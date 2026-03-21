import { Logger } from '@nestjs/common';
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import {
  RenewalService,
  RENEWAL_JOB_RUN_DAILY_CHECK,
} from '../renewal.service';
import { QUEUE_NOTIFICATIONS } from '../../../infrastructure/queues/queue.module';

@Processor(QUEUE_NOTIFICATIONS)
export class RenewalCheckProcessor {
  private readonly logger = new Logger(RenewalCheckProcessor.name);

  constructor(private readonly renewalService: RenewalService) {}

  @Process(RENEWAL_JOB_RUN_DAILY_CHECK)
  async handleDailyCheck(): Promise<void> {
    await this.renewalService.runDailyCheck();
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error): Promise<void> {
    if (job.name !== RENEWAL_JOB_RUN_DAILY_CHECK) return;

    this.logger.error(
      `Renewal job ${job.name} (id=${String(job.id)}) failed (attempt ${job.attemptsMade}): ${error.message}`,
      error.stack,
    );
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      await this.renewalService.notifySuperAdminOnFailure(error);
    }
  }
}
