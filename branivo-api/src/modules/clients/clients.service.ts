import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { AuditService } from '../../common/audit/audit.service';
import { PushSubscriptionRepository } from '../notifications/repositories/push-subscription.repository';
import { RegisterPushSubscriptionDto } from '../notifications/dto/register-push-subscription.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly pushSubscriptionRepository: PushSubscriptionRepository,
    private readonly tenantContext: TenantContext,
    private readonly auditService: AuditService,
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

    await this.auditService.log({
      tenantId,
      userId: clientId,
      action: 'client.push_subscription.registered',
      entityType: 'end_client',
      entityId: clientId,
      metadata: { endpoint: dto.endpoint },
    });
  }
}
