import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryAddress } from '../interfaces/delivery-address.interface';
import {
  LogisticsAdapter,
  LogisticsAdapterResult,
} from './logistics-adapter.interface';

interface EcontShipmentResponse {
  shipmentStatus: {
    shipmentNumber: string;
  };
}

@Injectable()
export class EcontAdapter implements LogisticsAdapter {
  private readonly logger = new Logger(EcontAdapter.name);
  private readonly timeout = 10_000;

  constructor(private readonly config: ConfigService) {}

  async createDelivery(params: {
    tenantId: string;
    policyId: string;
    policyNumber: string;
    deliveryAddress: DeliveryAddress;
  }): Promise<LogisticsAdapterResult> {
    const apiUrl = this.config.getOrThrow<string>('ECONT_API_URL');
    const userName = this.config.getOrThrow<string>('ECONT_USERNAME');
    const password = this.config.getOrThrow<string>('ECONT_PASSWORD');

    const credentials = Buffer.from(`${userName}:${password}`).toString(
      'base64',
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/services/Shipments2.0/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${credentials}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          shipment: {
            senderClient: { name: 'Branivo' },
            receiverClient: { name: params.deliveryAddress.recipientName },
            receiverAddress: {
              city: { name: params.deliveryAddress.city },
              street: params.deliveryAddress.addressLine,
              zip: params.deliveryAddress.postCode,
            },
            receiverPhone: params.deliveryAddress.phone,
            description: `Стикер ГО — ${params.policyNumber}`,
          },
        }),
      });
    } catch (err) {
      throw new Error(
        `Econt API request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Econt API error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as EcontShipmentResponse;
    const trackingNumber = data.shipmentStatus?.shipmentNumber ?? null;

    this.logger.log(
      `Econt shipment created. Tracking: ${trackingNumber ?? 'N/A'}, Policy: ${params.policyNumber}`,
    );

    const estimatedDeliveryDate = new Date();
    estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + 3);

    return {
      trackingNumber,
      estimatedDeliveryDate,
      provider: 'econt',
    };
  }
}
