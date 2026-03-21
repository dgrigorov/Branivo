import { DeliveryAddress } from '../interfaces/delivery-address.interface';

export interface LogisticsAdapterResult {
  trackingNumber: string | null;
  estimatedDeliveryDate: Date | null;
  provider: 'speedy' | 'econt' | 'manual';
}

export interface LogisticsAdapter {
  createDelivery(params: {
    tenantId: string;
    policyId: string;
    policyNumber: string;
    deliveryAddress: DeliveryAddress;
  }): Promise<LogisticsAdapterResult>;
}
