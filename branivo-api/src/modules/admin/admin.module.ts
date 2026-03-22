import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { QuotesModule } from '../quotes/quotes.module';
import { TenantInvitation } from './entities/tenant-invitation.entity';
import { TenantInvitationsRepository } from './repositories/tenant-invitations.repository';
import { AdminTenantsService } from './admin-tenants.service';
import { AdminTenantsController } from './admin-tenants.controller';
import { WebhooksController } from './webhooks.controller';
import { CryptoService } from '../../common/crypto/crypto.service';
import { EmailService } from '../../common/email/email.service';
import { AdminHealthRepository } from './repositories/admin-health.repository';
import { AdminHealthService } from './admin-health.service';
import { AdminHealthController } from './admin-health.controller';
import { AdminHealthJob } from './admin-health.job';
import { AdminInsurerMonitorRepository } from './repositories/admin-insurer-monitor.repository';
import { AdminInsurerMonitorService } from './admin-insurer-monitor.service';
import { AdminInsurerMonitorController } from './admin-insurer-monitor.controller';
import { AdminInsurerMonitorJob } from './admin-insurer-monitor.job';
import { AdminSubscriptionRepository } from './repositories/admin-subscription.repository';
import { AdminSubscriptionService } from './admin-subscription.service';
import { AdminSubscriptionController } from './admin-subscription.controller';
import { AdminSubscriptionJob } from './admin-subscription.job';
import { AdminNotificationRepository } from './repositories/admin-notification.repository';
import { AdminNotificationService } from './admin-notification.service';
import { AdminNotificationController } from './admin-notification.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantInvitation]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('ONBOARDING_JWT_SECRET'),
        signOptions: { expiresIn: '48h' },
      }),
    }),
    TenantsModule,
    UsersModule,
    QuotesModule,
  ],
  controllers: [
    AdminTenantsController,
    WebhooksController,
    AdminHealthController,
    AdminInsurerMonitorController,
    AdminSubscriptionController,
    AdminNotificationController,
  ],
  providers: [
    AdminTenantsService,
    TenantInvitationsRepository,
    CryptoService,
    EmailService,
    AdminHealthRepository,
    AdminHealthService,
    AdminHealthJob,
    AdminInsurerMonitorRepository,
    AdminInsurerMonitorService,
    AdminInsurerMonitorJob,
    AdminSubscriptionRepository,
    AdminSubscriptionService,
    AdminSubscriptionJob,
    AdminNotificationRepository,
    AdminNotificationService,
  ],
  exports: [AdminTenantsService],
})
export class AdminModule {}
