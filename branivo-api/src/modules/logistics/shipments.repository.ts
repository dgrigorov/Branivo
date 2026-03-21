import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Shipment } from './entities/shipment.entity';
import { DeliveryAddress } from './interfaces/delivery-address.interface';

@Injectable()
export class ShipmentsRepository {
  constructor(
    @InjectRepository(Shipment)
    private readonly repo: Repository<Shipment>,
  ) {}

  async createShipment(data: {
    tenantId: string;
    policyId: string;
    provider: 'speedy' | 'econt' | 'manual';
    deliveryAddress: DeliveryAddress;
  }): Promise<Shipment> {
    const shipment = this.repo.create({
      tenantId: data.tenantId,
      policyId: data.policyId,
      provider: data.provider,
      deliveryAddress: data.deliveryAddress,
      status: 'pending',
      trackingNumber: null,
      estimatedDeliveryDate: null,
      receiptS3Key: null,
      errorMessage: null,
    });
    return this.repo.save(shipment);
  }

  async updateShipmentTracking(
    id: string,
    trackingNumber: string | null,
    estimatedDeliveryDate: Date | null,
    status: 'dispatched' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    await this.repo.update(id, {
      trackingNumber,
      estimatedDeliveryDate,
      status,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date(),
    });
  }

  async findByPolicyIdForTenant(
    tenantId: string,
    policyId: string,
  ): Promise<Shipment | null> {
    return this.repo.findOne({
      where: { tenantId, policyId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }
}
