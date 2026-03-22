import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { NotificationLog } from './entities/notification-log.entity';
import { TenantRenewalConfig } from './entities/tenant-renewal-config.entity';
import { PushChannel } from './channels/push.channel';
import { SmsChannel } from './channels/sms.channel';
import { EmailChannel } from './channels/email.channel';
import { NotificationProcessor } from './processors/notification.processor';
import { EmailModule } from '../../infrastructure/email/email.module';
import { QUEUE_NOTIFICATIONS } from '../../infrastructure/queues/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationLog, TenantRenewalConfig]),
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
    EmailModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    PushChannel,
    SmsChannel,
    EmailChannel,
    NotificationProcessor,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
