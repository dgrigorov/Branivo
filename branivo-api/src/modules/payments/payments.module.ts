import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { QueueModule } from '../../infrastructure/queues/queue.module';
import { EmailModule } from '../../infrastructure/email/email.module';
import { QuotesModule } from '../quotes/quotes.module';
import { TenantsModule } from '../tenants/tenants.module';
import { PoliciesModule } from '../policies/policies.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { PaymentsController } from './payments.controller';
import { WellKnownController } from './well-known.controller';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './payments.repository';
import { StripeService } from './stripe.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { WebhookProcessingProcessor } from './webhook-processing.processor';
import { Payment } from './entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    TenantContextModule,
    QuotesModule, // за QuotesRepository достъп
    TenantsModule, // за tenant stripe_account_id
    PoliciesModule, // за PoliciesRepository + PolicyEventsRepository
    CommissionsModule, // за CommissionsService.getRate()
    QueueModule, // за QUEUE_PDF_GENERATION + QUEUE_WEBHOOK_PROCESSING
    ConfigModule,
    EmailModule, // за StripeWebhookService.sendStripeRevocationEmail()
  ],
  controllers: [PaymentsController, WellKnownController],
  providers: [
    PaymentsService,
    PaymentsRepository,
    StripeService,
    StripeWebhookService,
    WebhookProcessingProcessor,
  ],
  exports: [PaymentsService, StripeService, PaymentsRepository],
})
export class PaymentsModule {}
