/**
 * Super Admin context — intentionally NO tenant_id scope.
 * Health queries aggregate across ALL tenants.
 * This is a legitimate exception documented in project-context.md #1.
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantHealthSummaryResponseDto } from '../dto/tenant-health-summary-response.dto';
import {
  TenantHealthDetailResponseDto,
  PendingDowngradeInfo,
} from '../dto/tenant-health-detail-response.dto';
import { InactiveTenantAlertDto } from '../dto/inactive-tenant-alert.dto';

interface RawTenantHealthSummary {
  tenantId: string;
  tenantName: string;
  slug: string;
  status: string;
  subscriptionTier: string | null;
  policiesLast30Days: string;
  lastActivityAt: Date | null;
}

interface RawTenantHealthDetail {
  tenantId: string;
  tenantName: string;
  activeUsersCount: string;
  totalRevenueBgn: string;
  vehicleCount: string;
  lastPolicyCreatedAt: Date | null;
  lastPolicyInsurer: string | null;
  activeFeatureFlags: Record<string, boolean> | null;
  currentPlan: string;
  pendingDowngrade: PendingDowngradeInfo | null;
}

interface RawInactiveTenantAlert {
  tenantId: string;
  tenantName: string;
  inactiveDays: string | null;
}

@Injectable()
export class AdminHealthRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findAllTenantsHealth(): Promise<TenantHealthSummaryResponseDto[]> {
    const rows = await this.dataSource.query<RawTenantHealthSummary[]>(`
      SELECT
        t.id               AS "tenantId",
        t.name             AS "tenantName",
        t.slug,
        t.status,
        tc.subscription_tier AS "subscriptionTier",
        COUNT(p.id) FILTER (
          WHERE p.created_at >= NOW() - INTERVAL '30 days'
            AND p.deleted_at IS NULL
        )::int             AS "policiesLast30Days",
        MAX(p.created_at)  AS "lastActivityAt"
      FROM tenants t
      LEFT JOIN tenant_configs tc ON tc.tenant_id = t.id AND tc.deleted_at IS NULL
      LEFT JOIN policies p
        ON p.tenant_id = t.id AND p.deleted_at IS NULL
      WHERE t.deleted_at IS NULL
      GROUP BY t.id, t.name, t.slug, t.status, tc.subscription_tier
      ORDER BY t.name
    `);

    return rows.map((row) => {
      const lastActivityAt = row.lastActivityAt
        ? new Date(row.lastActivityAt).toISOString()
        : null;

      const now = Date.now();
      const inactiveDays =
        row.lastActivityAt !== null
          ? Math.floor(
              (now - new Date(row.lastActivityAt).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;

      const dto = new TenantHealthSummaryResponseDto();
      dto.tenantId = row.tenantId;
      dto.tenantName = row.tenantName;
      dto.slug = row.slug;
      dto.status = row.status;
      dto.subscriptionTier = row.subscriptionTier;
      dto.policiesLast30Days = Number(row.policiesLast30Days);
      dto.lastActivityAt = lastActivityAt;
      dto.inactiveDays = inactiveDays;
      return dto;
    });
  }

  async findTenantHealthDetail(
    tenantId: string,
  ): Promise<TenantHealthDetailResponseDto | null> {
    const rows = await this.dataSource.query<RawTenantHealthDetail[]>(
      `
      SELECT
        t.id                                AS "tenantId",
        t.name                              AS "tenantName",
        COUNT(DISTINCT u.id) FILTER (
          WHERE u.deleted_at IS NULL
        )::int                              AS "activeUsersCount",
        COALESCE(SUM(p.premium_amount), 0)  AS "totalRevenueBgn",
        COUNT(DISTINCT v.id) FILTER (
          WHERE v.deleted_at IS NULL
        )::int                              AS "vehicleCount",
        MAX(p.created_at)                   AS "lastPolicyCreatedAt",
        i.name                              AS "lastPolicyInsurer",
        t.features                          AS "activeFeatureFlags",
        t.plan                              AS "currentPlan",
        t.pending_downgrade                 AS "pendingDowngrade"
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id
      LEFT JOIN policies p ON p.tenant_id = t.id AND p.deleted_at IS NULL
      LEFT JOIN vehicles v ON v.tenant_id = t.id
      LEFT JOIN insurers i ON i.id = (
        SELECT insurer_id FROM policies
        WHERE tenant_id = t.id AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1
      )
      WHERE t.id = $1
        AND t.deleted_at IS NULL
      GROUP BY t.id, t.name, t.plan, t.pending_downgrade, i.name, t.features
      `,
      [tenantId],
    );

    if (rows.length === 0) return null;

    const row = rows[0];
    const flags = row.activeFeatureFlags ?? {};
    const activeFeatureFlags = Object.entries(flags)
      .filter(([, v]) => v === true)
      .map(([k]) => k);

    const dto = new TenantHealthDetailResponseDto();
    dto.tenantId = row.tenantId;
    dto.tenantName = row.tenantName;
    dto.activeUsersCount = Number(row.activeUsersCount);
    dto.totalRevenueBgn = Number(row.totalRevenueBgn);
    dto.vehicleCount = Number(row.vehicleCount);
    dto.lastPolicyCreatedAt = row.lastPolicyCreatedAt
      ? new Date(row.lastPolicyCreatedAt).toISOString()
      : null;
    dto.lastPolicyInsurer = row.lastPolicyInsurer;
    dto.activeFeatureFlags = activeFeatureFlags;
    dto.currentPlan = row.currentPlan;
    dto.pendingDowngrade = row.pendingDowngrade ?? null;
    return dto;
  }

  async findTenantsWithInactiveDays(
    days: number,
  ): Promise<InactiveTenantAlertDto[]> {
    // Use days * 3 as the scan window (min 90 days) for index optimization
    const scanDays = Math.max(days * 3, 90);
    const rows = await this.dataSource.query<RawInactiveTenantAlert[]>(
      `
      SELECT
        t.id    AS "tenantId",
        t.name  AS "tenantName",
        EXTRACT(DAY FROM NOW() - MAX(p.created_at))::int AS "inactiveDays"
      FROM tenants t
      LEFT JOIN policies p
        ON p.tenant_id = t.id
        AND p.deleted_at IS NULL
        AND p.created_at >= NOW() - ($2 * INTERVAL '1 day')
      WHERE t.deleted_at IS NULL
        AND t.status = 'active'
      GROUP BY t.id, t.name
      HAVING COUNT(p.id) FILTER (
        WHERE p.created_at >= NOW() - ($1 * INTERVAL '1 day')
      ) = 0
        AND (MAX(p.created_at) IS NULL
          OR MAX(p.created_at) < NOW() - ($1 * INTERVAL '1 day'))
      ORDER BY "inactiveDays" DESC NULLS LAST
      `,
      [days, scanDays],
    );

    return rows.map((row) => {
      const dto = new InactiveTenantAlertDto();
      dto.tenantId = row.tenantId;
      dto.tenantName = row.tenantName;
      dto.inactiveDays =
        row.inactiveDays !== null ? Number(row.inactiveDays) : 0;
      return dto;
    });
  }

  /**
   * AC4: Detect basic tenant isolation anomalies.
   * Orphaned policies (tenant_id pointing to a non-existent/deleted tenant)
   * indicate a data isolation breach.
   */
  async countOrphanedPolicies(): Promise<number> {
    const rows = await this.dataSource.query<{ count: string }[]>(`
      SELECT COUNT(p.id)::int AS count
      FROM policies p
      LEFT JOIN tenants t ON t.id = p.tenant_id AND t.deleted_at IS NULL
      WHERE p.deleted_at IS NULL
        AND t.id IS NULL
    `);
    return Number(rows[0]?.count ?? 0);
  }
}
