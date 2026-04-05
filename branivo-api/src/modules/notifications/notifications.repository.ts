import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  NotificationLog,
  NotificationChannel,
  NotificationStatus,
} from './entities/notification-log.entity';
import { RenewalStage } from '../renewal/renewal.repository';
import {
  TenantRenewalConfig,
  StageConfig,
} from './entities/tenant-renewal-config.entity';

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
    @InjectRepository(TenantRenewalConfig)
    private readonly tenantRenewalConfigRepo: Repository<TenantRenewalConfig>,
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

  async findTenantSlug(tenantId: string): Promise<string | null> {
    const rows = await this.dataSource.query<Array<{ slug: string }>>(
      `SELECT slug FROM tenants WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [tenantId],
    );
    return rows[0]?.slug ?? null;
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

  async findTenantLogoUrl(tenantId: string): Promise<string | null> {
    const rows = await this.dataSource.query<
      Array<{ logo_url: string | null }>
    >(
      `SELECT logo_url FROM tenants WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [tenantId],
    );
    return rows[0]?.logo_url ?? null;
  }

  async findTenantRenewalConfig(
    tenantId: string,
  ): Promise<StageConfig[] | null> {
    const config = await this.tenantRenewalConfigRepo.findOne({
      where: { tenantId },
    });
    return config?.stagesConfig ?? null;
  }

  async upsertTenantRenewalConfig(
    tenantId: string,
    stages: StageConfig[],
  ): Promise<StageConfig[] | null> {
    const existing = await this.tenantRenewalConfigRepo.findOne({
      where: { tenantId },
    });
    const oldConfig = existing?.stagesConfig ?? null;

    await this.dataSource.query(
      `INSERT INTO tenant_renewal_config (tenant_id, stages_config, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (tenant_id) DO UPDATE
         SET stages_config = EXCLUDED.stages_config,
             updated_at = NOW()`,
      [tenantId, JSON.stringify(stages)],
    );

    return oldConfig;
  }
}
