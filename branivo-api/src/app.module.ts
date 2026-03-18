import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AuthModule } from './modules/auth/auth.module';
import { OcrModule } from './modules/ocr/ocr.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { PoliciesModule } from './modules/policies/policies.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BillingModule } from './modules/billing/billing.module';
import { AdminModule } from './modules/admin/admin.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { QueueModule } from './infrastructure/queues/queue.module';
import { LoggerModule } from './infrastructure/logger/logger.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([
      { name: 'public', ttl: 60000, limit: 100 },
      { name: 'auth', ttl: 60000, limit: 300 },
    ]),
    LoggerModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    HealthModule,
    TenantsModule,
    AuthModule,
    OcrModule,
    QuotesModule,
    PoliciesModule,
    PaymentsModule,
    NotificationsModule,
    BillingModule,
    AdminModule,
  ],
})
export class AppModule {}
