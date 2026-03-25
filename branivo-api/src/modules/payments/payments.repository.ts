import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BaseRepository } from '../../common/base.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import {
  Payment,
  PaymentMethod,
  PaymentStatus,
} from './entities/payment.entity';

@Injectable()
export class PaymentsRepository extends BaseRepository<Payment> {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    tenantContext: TenantContext,
  ) {
    super(paymentRepo, tenantContext);
  }

  async findByIdempotencyKey(key: string): Promise<Payment | null> {
    await this.setTenantSession();
    return this.paymentRepo.findOne({
      where: { idempotencyKey: key, deletedAt: IsNull() },
    });
  }

  async findByStripeIntentId(intentId: string): Promise<Payment | null> {
    // НЕ tenant-scoped — webhook може да идва без tenant context
    return this.paymentRepo.findOne({
      where: { stripePaymentIntentId: intentId, deletedAt: IsNull() },
    });
  }

  async updateStatus(
    id: string,
    status: PaymentStatus,
    failureReason?: string,
  ): Promise<void> {
    await this.paymentRepo.update(id, {
      status,
      ...(failureReason && { failureReason }),
      updatedAt: new Date(),
    });
  }

  async findByEndClientId(
    endClientId: string,
    tenantId: string,
  ): Promise<Payment[]> {
    return this.paymentRepo.find({
      where: { endClientId, tenantId },
    });
  }

  async updatePaymentMethod(
    id: string,
    paymentMethod: PaymentMethod,
  ): Promise<void> {
    await this.paymentRepo.update(id, {
      paymentMethod,
      updatedAt: new Date(),
    });
  }
}
