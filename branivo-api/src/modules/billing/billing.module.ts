import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { BillingController } from './billing.controller';
import { BillingService, BILLING_JOB_RUN_ALL_TENANTS } from './billing.service';
import { BillingRepository } from './billing.repository';
import { InvoiceGenerationProcessor } from './processors/invoice-generation.processor';
import { Invoice } from './entities/invoice.entity';
import { EmailModule } from '../../infrastructure/email/email.module';
import { QUEUE_BILLING } from '../../infrastructure/queues/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice]),
    BullModule.registerQueue({ name: QUEUE_BILLING }),
    EmailModule,
  ],
  controllers: [BillingController],
  providers: [BillingService, BillingRepository, InvoiceGenerationProcessor],
  exports: [BillingService],
})
export class BillingModule implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUE_BILLING) private readonly billingQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.billingQueue.add(
      BILLING_JOB_RUN_ALL_TENANTS,
      {},
      {
        repeat: { cron: '0 6 1 * *', tz: 'Europe/Sofia' },
        jobId: 'monthly-billing-run',
      },
    );
  }
}
