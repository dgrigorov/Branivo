import { Injectable, Logger } from '@nestjs/common';
import { ShipmentsRepository } from './shipments.repository';
import { PoliciesRepository } from '../policies/policies.repository';
import { TenantsRepository } from '../tenants/tenants.repository';
import { SpeedyAdapter } from './adapters/speedy.adapter';
import { EcontAdapter } from './adapters/econt.adapter';
import { ManualAdapter } from './adapters/manual.adapter';
import { LogisticsAdapter } from './adapters/logistics-adapter.interface';
import { StickerDeliveryJobPayload } from './interfaces/sticker-delivery-job.payload';
import { DeliveryAddress } from './interfaces/delivery-address.interface';

@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);

  constructor(
    private readonly shipmentsRepo: ShipmentsRepository,
    private readonly policiesRepo: PoliciesRepository,
    private readonly tenantsRepo: TenantsRepository,
    private readonly speedyAdapter: SpeedyAdapter,
    private readonly econtAdapter: EcontAdapter,
    private readonly manualAdapter: ManualAdapter,
  ) {}

  async initiateDelivery(payload: StickerDeliveryJobPayload): Promise<void> {
    const { tenantId, policyId, policyNumber } = payload;

    // 1. AC2 double-check guard — проверка на feature flag в service (втора проверка)
    const tenant = await this.tenantsRepo.findById(tenantId);
    if (!tenant || tenant.features['sticker_delivery'] !== true) {
      this.logger.log(
        `sticker_delivery disabled for tenant ${tenantId}, skipping — policyId: ${policyId}`,
      );
      return;
    }

    // 2. Вземи полицата (без tenant scope — job context)
    const policy = await this.policiesRepo.findByIdWithoutScope(policyId);
    if (!policy) {
      this.logger.error(`Policy not found: ${policyId}`);
      return;
    }

    // 3. Определи delivery address — fall back към ManualAdapter ако е null
    const deliveryAddress: DeliveryAddress | null = policy.deliveryAddress;
    if (!deliveryAddress) {
      this.logger.warn(
        `No delivery_address for policy ${policyId} — falling back to ManualAdapter`,
      );
      await this.manualAdapter.createDelivery({
        tenantId,
        policyId,
        policyNumber,
        deliveryAddress: {
          recipientName: 'Неизвестен',
          phone: '',
          city: '',
          postCode: '',
          addressLine: '',
        },
      });
      return;
    }

    // 4. Избери адаптер по tenant config
    const preferredProvider =
      (tenant.features['preferredLogisticsProvider'] as unknown as string | undefined) ??
      'speedy';
    const primaryAdapter: LogisticsAdapter =
      preferredProvider === 'econt' ? this.econtAdapter : this.speedyAdapter;
    const providerName: 'speedy' | 'econt' =
      preferredProvider === 'econt' ? 'econt' : 'speedy';

    // 5. Създай shipment запис (status: 'pending')
    const shipment = await this.shipmentsRepo.createShipment({
      tenantId,
      policyId,
      provider: providerName,
      deliveryAddress,
    });

    // 6. Изпълни adapter (BullMQ ще retry при грешка)
    try {
      const result = await primaryAdapter.createDelivery({
        tenantId,
        policyId,
        policyNumber,
        deliveryAddress,
      });

      await this.shipmentsRepo.updateShipmentTracking(
        shipment.id,
        result.trackingNumber,
        result.estimatedDeliveryDate,
        'dispatched',
      );

      this.logger.log(
        `Sticker delivery dispatched for policy ${policyNumber}, tracking: ${result.trackingNumber ?? 'N/A'}`,
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Sticker delivery failed for policy ${policyNumber}: ${errorMessage}`,
      );

      // При финален failure (след всички retry) — ManualAdapter + mark failed
      await this.shipmentsRepo.updateShipmentTracking(
        shipment.id,
        null,
        null,
        'failed',
        errorMessage,
      );

      await this.manualAdapter.createDelivery({
        tenantId,
        policyId,
        policyNumber,
        deliveryAddress,
      });

      throw err; // Re-throw за BullMQ retry
    }
  }
}
