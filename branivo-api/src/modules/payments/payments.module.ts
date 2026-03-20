import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { QuotesModule } from '../quotes/quotes.module';
import { TenantsModule } from '../tenants/tenants.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './payments.repository';
import { StripeService } from './stripe.service';
import { Payment } from './entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    TenantContextModule,
    QuotesModule, // за QuotesRepository достъп
    TenantsModule, // за tenant stripe_account_id
    ConfigModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository, StripeService],
  exports: [PaymentsService, StripeService, PaymentsRepository],
  // exports нужни за Story 4.3 (webhook handler)
})
export class PaymentsModule {}
