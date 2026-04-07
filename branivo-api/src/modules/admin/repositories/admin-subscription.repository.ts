/**
 * Super Admin context — intentionally NO tenant_id scope for cross-tenant queries.
 * Tenant ID always comes explicitly from URL parameter.
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../../../common/audit/audit.service';
import { PendingDowngrade } from '../../tenants/entities/tenant.entity';

export interface TenantRow {
  id: string;
  plan: string;
  features: Record<string, boolean>;
  pendingDowngrade: PendingDowngrade | null;
}

export interface AuditEntry {
  tenantId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class AdminSubscriptionRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async findTenantById(tenantId: string): Promise<TenantRow | null> {
    const rows = await this.dataSource.query<TenantRow[]>(
      `SELECT id, plan, features, pending_downgrade AS "pendingDowngrade"
       FROM tenants
       WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    return rows[0] ?? null;
  }

  async applyUpgrade(
    tenantId: string,
    newPlan: string,
    newFeatures: Record<string, boolean>,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE tenants
       SET plan = $2, features = $3, pending_downgrade = NULL, updated_at = NOW()
       WHERE id = $1`,
      [tenantId, newPlan, JSON.stringify(newFeatures)],
    );
  }

  async schedulePendingDowngrade(
    tenantId: string,
    pending: PendingDowngrade,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE tenants
       SET pending_downgrade = $2, updated_at = NOW()
       WHERE id = $1`,
      [tenantId, JSON.stringify(pending)],
    );
  }

  async applyPendingDowngrade(
    tenantId: string,
    newPlan: string,
    newFeatures: Record<string, boolean>,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE tenants
       SET plan = $2, features = $3, pending_downgrade = NULL, updated_at = NOW()
       WHERE id = $1`,
      [tenantId, newPlan, JSON.stringify(newFeatures)],
    );
  }

  async findTenantsWithDuePendingDowngrade(): Promise<
    Array<{
      id: string;
      plan: string;
      features: Record<string, boolean>;
      pendingDowngrade: PendingDowngrade;
    }>
  > {
    return this.dataSource.query(
      `SELECT id, plan, features, pending_downgrade AS "pendingDowngrade"
       FROM tenants
       WHERE pending_downgrade IS NOT NULL
         AND (pending_downgrade->>'enforceAt')::timestamptz <= NOW()
         AND deleted_at IS NULL`,
    );
  }

  async insertAuditLog(entry: AuditEntry): Promise<void> {
    await this.auditService.log({
      tenantId: entry.tenantId,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
    });
  }

  async findBrokerAdminEmail(tenantId: string): Promise<string | null> {
    const rows = await this.dataSource.query<Array<{ email: string }>>(
      `SELECT email
       FROM users
       WHERE tenant_id = $1 AND role = 'broker_admin' AND deleted_at IS NULL
       LIMIT 1`,
      [tenantId],
    );
    return rows[0]?.email ?? null;
  }
}
