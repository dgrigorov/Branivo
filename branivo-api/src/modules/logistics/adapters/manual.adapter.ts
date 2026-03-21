import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { DeliveryAddress } from '../interfaces/delivery-address.interface';
import {
  LogisticsAdapter,
  LogisticsAdapterResult,
} from './logistics-adapter.interface';

@Injectable()
export class ManualAdapter implements LogisticsAdapter {
  private readonly logger = new Logger(ManualAdapter.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  async createDelivery(params: {
    tenantId: string;
    policyId: string;
    policyNumber: string;
    deliveryAddress: DeliveryAddress;
  }): Promise<LogisticsAdapterResult> {
    this.logger.warn(
      `Manual delivery fallback triggered for policy: ${params.policyNumber}, tenant: ${params.tenantId}`,
    );

    await this.notificationsService.notifyBroker({
      tenantId: params.tenantId,
      subject: 'Ръчна обработка на стикер',
      message:
        `Автоматичната доставка на стикер за полица ${params.policyNumber} не успя. ` +
        `Необходима е ръчна обработка. Получател: ${params.deliveryAddress.recipientName}, ` +
        `${params.deliveryAddress.addressLine}, ${params.deliveryAddress.city}.`,
    });

    return {
      trackingNumber: null,
      estimatedDeliveryDate: null,
      provider: 'manual',
    };
  }
}
