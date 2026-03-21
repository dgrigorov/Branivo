import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type RenewalStage =
  | 'd_minus_30'
  | 'd_minus_7'
  | 'd_minus_3'
  | 'd_minus_1'
  | 'd_plus_1';

export interface ExpiringPolicyRow {
  id: string;
  tenant_id: string;
  vehicle_id: string | null;
  coverage_end_date: Date;
  end_client_id: string | null;
}

@Injectable()
export class RenewalRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findExpiringPolicies(targetDate: Date): Promise<ExpiringPolicyRow[]> {
    return this.dataSource.query<ExpiringPolicyRow[]>(
      `SELECT p.id, p.tenant_id, p.vehicle_id, p.coverage_end_date, p.end_client_id
       FROM policies p
       JOIN tenants t ON p.tenant_id = t.id
       WHERE p.status = 'active'
         AND p.deleted_at IS NULL
         AND t.status IN ('active', 'stripe_revoked')
         AND t.deleted_at IS NULL
         AND DATE(p.coverage_end_date AT TIME ZONE 'Europe/Sofia') = $1::date`,
      [targetDate],
    );
  }

  async hasNotificationBeenQueued(
    policyId: string,
    stage: RenewalStage,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<[{ exists: boolean }]>(
      `SELECT EXISTS (
         SELECT 1 FROM renewal_notification_log
         WHERE policy_id = $1 AND stage = $2
       ) AS exists`,
      [policyId, stage],
    );
    return rows[0].exists;
  }

  async isPolicyRenewed(
    vehicleId: string,
    coverageEndDate: Date,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<[{ exists: boolean }]>(
      `SELECT EXISTS (
         SELECT 1 FROM policies
         WHERE vehicle_id = $1
           AND status = 'active'
           AND coverage_start_date >= $2
           AND deleted_at IS NULL
       ) AS exists`,
      [vehicleId, coverageEndDate],
    );
    return rows[0].exists;
  }

  async recordQueuedNotification(
    tenantId: string,
    policyId: string,
    stage: RenewalStage,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO renewal_notification_log (tenant_id, policy_id, stage)
       VALUES ($1, $2, $3)
       ON CONFLICT (policy_id, stage) DO NOTHING`,
      [tenantId, policyId, stage],
    );
  }
}
