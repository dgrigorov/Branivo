import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  NotificationLog,
  NotificationChannel,
  NotificationStatus,
} from './entities/notification-log.entity';
import { RenewalStage } from '../renewal/renewal.repository';

export interface EndClientRow {
  id: string;
  email: string | null;
  push_token: string | null;
  phone_number: string;
  first_name: string | null;
}

@Injectable()
export class NotificationsRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(NotificationLog)
    private readonly notificationLogRepo: Repository<NotificationLog>,
  ) {}

  async logNotification(params: {
    tenantId: string;
    policyId: string;
    stage: RenewalStage;
    channel: NotificationChannel;
    status: NotificationStatus;
    deliveredAt: Date | null;
  }): Promise<void> {
    await this.notificationLogRepo.insert({
      tenantId: params.tenantId,
      policyId: params.policyId,
      stage: params.stage,
      channel: params.channel,
      status: params.status,
      deliveredAt: params.deliveredAt,
    });
  }

  async findEndClientForPolicy(policyId: string): Promise<EndClientRow | null> {
    const rows = await this.dataSource.query<EndClientRow[]>(
      `SELECT ec.id, ec.email, ec.push_token, ec.phone_number, ec.first_name
       FROM policies p
       JOIN end_clients ec ON p.end_client_id = ec.id
       WHERE p.id = $1 AND p.deleted_at IS NULL AND ec.deleted_at IS NULL
       LIMIT 1`,
      [policyId],
    );
    return rows[0] ?? null;
  }

  async findTenantDomain(tenantId: string): Promise<string | null> {
    const rows = await this.dataSource.query<Array<{ domain: string }>>(
      `SELECT domain FROM tenant_domains
       WHERE tenant_id = $1 AND is_primary = true AND deleted_at IS NULL
       LIMIT 1`,
      [tenantId],
    );
    return rows[0]?.domain ?? null;
  }

  async findBrokerAdminEmail(tenantId: string): Promise<string | null> {
    const rows = await this.dataSource.query<Array<{ email: string }>>(
      `SELECT email FROM users
       WHERE tenant_id = $1 AND role = 'broker_admin' AND deleted_at IS NULL
       LIMIT 1`,
      [tenantId],
    );
    return rows[0]?.email ?? null;
  }
}
