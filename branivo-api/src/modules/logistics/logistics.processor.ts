import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { QUEUE_LOGISTICS } from '../../infrastructure/queues/queue.module';
import { LogisticsService } from './logistics.service';
import { StickerDeliveryJobPayload } from './interfaces/sticker-delivery-job.payload';

@Processor(QUEUE_LOGISTICS)
export class LogisticsProcessor {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Process('logistics:sticker-create')
  async process(job: Job<StickerDeliveryJobPayload>): Promise<void> {
    await this.logisticsService.initiateDelivery(job.data);
  }
}
