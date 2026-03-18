import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TenantContextModule } from './common/tenant-context/tenant-context.module';
import { TenantMiddleware } from './common/tenant-context/tenant.middleware';
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
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
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
    TenantContextModule,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'api/docs(.*)', method: RequestMethod.ALL },
        { path: 'api/v1/auth/login', method: RequestMethod.POST },
        { path: 'api/v1/auth/2fa/verify', method: RequestMethod.POST },
        { path: 'api/v1/auth/refresh', method: RequestMethod.POST },
        { path: 'api/v1/auth/logout', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
