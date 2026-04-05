import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContext } from '../../../common/tenant-context/tenant.context';
import { PushSubscription } from '../entities/push-subscription.entity';

export interface UpsertPushSubscriptionDto {
  endpoint: string;
  p256dh: string;
  auth: string;
  type?: 'web' | 'fcm';
}

@Injectable()
export class PushSubscriptionRepository {
  constructor(
    @InjectRepository(PushSubscription)
    private readonly repo: Repository<PushSubscription>,
    private readonly tenantContext: TenantContext,
  ) {}

  private async setTenantSession(): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();
    await this.repo.query(
      `SELECT set_config('app.current_tenant_id', $1, true)`,
      [tenantId],
    );
  }

  async upsertSubscription(
    customerId: string,
    dto: UpsertPushSubscriptionDto,
  ): Promise<void> {
    await this.setTenantSession();
    const tenantId = this.tenantContext.getTenantId();
    await this.repo.query(
      `INSERT INTO push_subscriptions (customer_id, tenant_id, endpoint, p256dh, auth, type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (customer_id, endpoint) DO UPDATE
         SET p256dh = EXCLUDED.p256dh,
             auth   = EXCLUDED.auth,
             type   = EXCLUDED.type`,
      [
        customerId,
        tenantId,
        dto.endpoint,
        dto.p256dh,
        dto.auth,
        dto.type ?? 'web',
      ],
    );
  }

  async findByCustomerId(
    customerId: string,
    type?: 'web' | 'fcm',
  ): Promise<PushSubscription[]> {
    await this.setTenantSession();
    return this.repo.find({
      where: type ? { customerId, type } : { customerId },
    });
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await this.setTenantSession();
    const tenantId = this.tenantContext.getTenantId();
    await this.repo.delete({ endpoint, tenantId });
  }
}
