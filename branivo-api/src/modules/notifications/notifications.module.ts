import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { NotificationLog } from './entities/notification-log.entity';
import { TenantRenewalConfig } from './entities/tenant-renewal-config.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import { PushChannel } from './channels/push.channel';
import { SmsChannel } from './channels/sms.channel';
import { EmailChannel } from './channels/email.channel';
import { WebPushChannel } from './channels/web-push.channel';
import { NotificationProcessor } from './processors/notification.processor';
import { PushSubscriptionRepository } from './repositories/push-subscription.repository';
import { EmailModule } from '../../infrastructure/email/email.module';
import { TenantContextModule } from '../../common/tenant-context/tenant-context.module';
import { QUEUE_NOTIFICATIONS } from '../../infrastructure/queues/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationLog,
      TenantRenewalConfig,
      PushSubscription,
    ]),
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
    EmailModule,
    TenantContextModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    PushChannel,
    SmsChannel,
    EmailChannel,
    WebPushChannel,
    NotificationProcessor,
    PushSubscriptionRepository,
  ],
  exports: [NotificationsService, PushSubscriptionRepository],
})
export class NotificationsModule {}
