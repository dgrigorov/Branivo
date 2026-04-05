import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { PushSubscriptionRepository } from '../notifications/repositories/push-subscription.repository';
import { RegisterPushSubscriptionDto } from '../notifications/dto/register-push-subscription.dto';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    private readonly pushSubscriptionRepository: PushSubscriptionRepository,
    private readonly tenantContext: TenantContext,
    private readonly dataSource: DataSource,
  ) {}

  async registerPushSubscription(
    clientId: string,
    dto: RegisterPushSubscriptionDto,
  ): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();

    await this.pushSubscriptionRepository.upsertSubscription(clientId, {
      endpoint: dto.endpoint,
      p256dh: dto.p256dh,
      auth: dto.auth,
      type: dto.type ?? 'web',
    });

    await this.writeAuditLog(tenantId, clientId, dto.endpoint);
  }

  private async writeAuditLog(
    tenantId: string,
    clientId: string,
    endpoint: string,
  ): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          tenantId,
          clientId,
          'client.push_subscription.registered',
          'end_client',
          clientId,
          JSON.stringify({ endpoint }),
        ],
      );
    } catch (err) {
      this.logger.error('Failed to write audit log for push subscription', err);
    }
  }
}
