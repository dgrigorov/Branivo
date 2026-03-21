import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  notifyBroker(params: {
    tenantId: string;
    subject: string;
    message: string;
  }): Promise<void> {
    // TODO (Story 6.x): Implement actual broker notification (email/SMS/push)
    this.logger.warn(
      `[Broker Notification] tenant=${params.tenantId} subject="${params.subject}" message="${params.message}"`,
    );
    return Promise.resolve();
  }
}
