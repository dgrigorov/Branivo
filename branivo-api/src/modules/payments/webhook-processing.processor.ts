import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import Stripe from 'stripe';
import { QUEUE_WEBHOOK_PROCESSING } from '../../infrastructure/queues/queue.module';
import { StripeWebhookService } from './stripe-webhook.service';

@Processor(QUEUE_WEBHOOK_PROCESSING)
export class WebhookProcessingProcessor {
  private readonly logger = new Logger(WebhookProcessingProcessor.name);

  constructor(private readonly stripeWebhookService: StripeWebhookService) {}

  @Process('process-stripe-event')
  async process(job: Job<Stripe.Event>): Promise<void> {
    this.logger.log(
      `Processing webhook event: ${job.data.id} type: ${job.data.type} attempt: ${job.attemptsMade + 1}`,
    );
    await this.stripeWebhookService.handleEvent(job.data);
  }

  @OnQueueFailed()
  onFailed(job: Job<Stripe.Event>, error: Error): void {
    const maxAttempts = job.opts.attempts ?? 3;
    if (job.attemptsMade >= maxAttempts) {
      // Dead letter: all retries exhausted — alert Super Admin
      this.logger.error(
        `[DLQ] Webhook processing exhausted ${maxAttempts} retries for event: ${job.data.id} type: ${job.data.type}`,
        error.stack,
      );
      // TODO (Story 4.4+): Queue Super Admin alert via QUEUE_NOTIFICATIONS
    } else {
      this.logger.warn(
        `Webhook job failed (attempt ${job.attemptsMade}/${maxAttempts}), will retry: ${job.data.id}`,
      );
    }
  }
}
