import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmailService } from '../../common/email/email.service';
import { CreateSystemNotificationDto } from './dto/create-system-notification.dto';
import { SystemNotificationResponseDto } from './dto/system-notification-response.dto';
import { AdminNotificationRepository } from './repositories/admin-notification.repository';

@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(
    private readonly adminNotificationRepository: AdminNotificationRepository,
    private readonly emailService: EmailService,
  ) {}

  async broadcast(
    dto: CreateSystemNotificationDto,
    adminId: string,
  ): Promise<SystemNotificationResponseDto> {
    const dismissible = dto.type !== 'critical';
    const target = dto.tenantId ?? 'all';

    const notification = await this.adminNotificationRepository.create({
      adminId,
      target,
      type: dto.type,
      message: dto.message,
      dismissible,
    });

    if (dto.type === 'critical') {
      const emails =
        await this.adminNotificationRepository.findBrokerAdminEmails(target);
      for (const email of emails) {
        try {
          await this.emailService.sendSystemNotification({
            to: email,
            type: dto.type,
            message: dto.message,
          });
        } catch (err) {
          this.logger.error(
            `Failed to send critical notification email to ${email}`,
            err,
          );
        }
      }
    }

    return notification;
  }

  async listAll(): Promise<SystemNotificationResponseDto[]> {
    return this.adminNotificationRepository.findAll();
  }

  async deactivate(notificationId: string): Promise<void> {
    const updated =
      await this.adminNotificationRepository.deactivate(notificationId);
    if (!updated) {
      throw new NotFoundException('Notification not found or already inactive');
    }
  }

  async getActiveForTenant(
    tenantId: string,
  ): Promise<SystemNotificationResponseDto[]> {
    return this.adminNotificationRepository.findActiveForTenant(tenantId);
  }

  async dismiss(notificationId: string, tenantId: string): Promise<void> {
    const notification =
      await this.adminNotificationRepository.findById(notificationId);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (!notification.dismissible) {
      throw new BadRequestException(
        'Critical notifications cannot be dismissed',
      );
    }
    await this.adminNotificationRepository.dismiss(notificationId, tenantId);
  }
}
