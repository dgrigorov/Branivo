import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
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
import { UsersModule } from './modules/users/users.module';
import { AdminModule } from './modules/admin/admin.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ClientsModule } from './modules/clients/clients.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { TenantDomain } from './modules/tenants/entities/tenant-domain.entity';
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
    ScheduleModule.forRoot(),
    LoggerModule,
    DatabaseModule,
    TypeOrmModule.forFeature([TenantDomain]),
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
    UsersModule,
    AdminModule,
    SessionsModule,
    ClientsModule,
    VehiclesModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'api/docs/*path', method: RequestMethod.ALL },
        { path: 'api/docs', method: RequestMethod.ALL },
        { path: 'api/v1/auth/login', method: RequestMethod.POST },
        { path: 'api/v1/auth/2fa/verify', method: RequestMethod.POST },
        { path: 'api/v1/auth/refresh', method: RequestMethod.POST },
        { path: 'api/v1/auth/logout', method: RequestMethod.POST },
        {
          path: 'api/v1/admin/tenants/onboarding/*',
          method: RequestMethod.GET,
        },
        {
          path: 'api/v1/admin/tenants/onboarding/*',
          method: RequestMethod.POST,
        },
        { path: 'api/v1/webhooks/stripe', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
