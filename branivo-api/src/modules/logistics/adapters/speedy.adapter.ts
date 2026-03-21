import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryAddress } from '../interfaces/delivery-address.interface';
import {
  LogisticsAdapter,
  LogisticsAdapterResult,
} from './logistics-adapter.interface';

interface SpeedyShipmentResponse {
  id: string;
  parcels: Array<{ id: string; seqNo: number }>;
}

@Injectable()
export class SpeedyAdapter implements LogisticsAdapter {
  private readonly logger = new Logger(SpeedyAdapter.name);
  private readonly timeout = 10_000;

  constructor(private readonly config: ConfigService) {}

  async createDelivery(params: {
    tenantId: string;
    policyId: string;
    policyNumber: string;
    deliveryAddress: DeliveryAddress;
  }): Promise<LogisticsAdapterResult> {
    const apiUrl = this.config.getOrThrow<string>('SPEEDY_API_URL');
    const userName = this.config.getOrThrow<string>('SPEEDY_USERNAME');
    const password = this.config.getOrThrow<string>('SPEEDY_PASSWORD');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/v3/shipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          userName,
          password,
          service: { serviceId: 505 },
          recipient: {
            name: params.deliveryAddress.recipientName,
            phone: { number: params.deliveryAddress.phone },
            address: {
              localName: params.deliveryAddress.city,
              postCode: params.deliveryAddress.postCode,
              streetName: params.deliveryAddress.addressLine,
            },
          },
          content: { description: `Стикер ГО — ${params.policyNumber}` },
        }),
      });
    } catch (err) {
      throw new Error(
        `Speedy API request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Speedy API error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as SpeedyShipmentResponse;
    const trackingNumber = data.parcels?.[0]?.id ?? null;

    this.logger.log(
      `Speedy shipment created. Tracking: ${trackingNumber ?? 'N/A'}, Policy: ${params.policyNumber}`,
    );

    const estimatedDeliveryDate = new Date();
    estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + 3);

    return {
      trackingNumber,
      estimatedDeliveryDate,
      provider: 'speedy',
    };
  }
}
