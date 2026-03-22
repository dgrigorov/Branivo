/**
 * Super Admin context — intentionally NO tenant_id scope.
 * Insurer monitoring queries are cross-tenant by design.
 * This is a legitimate exception documented in project-context.md #1.
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface InsurerStatusRow {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  isManuallyDisabled: boolean;
  disabledReason: string | null;
  disabledByAdminId: string | null;
}

const INSURER_SELECT_SQL = `
  SELECT
    id,
    name,
    code,
    is_active             AS "isActive",
    is_manually_disabled  AS "isManuallyDisabled",
    disabled_reason       AS "disabledReason",
    disabled_by_admin_id  AS "disabledByAdminId"
  FROM insurers
  WHERE deleted_at IS NULL
`;

@Injectable()
export class AdminInsurerMonitorRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findAllInsurers(): Promise<InsurerStatusRow[]> {
    return this.dataSource.query<InsurerStatusRow[]>(
      `${INSURER_SELECT_SQL} ORDER BY name`,
    );
  }

  async findInsurerById(insurerId: string): Promise<InsurerStatusRow | null> {
    const rows = await this.dataSource.query<InsurerStatusRow[]>(
      `${INSURER_SELECT_SQL} AND id = $1`,
      [insurerId],
    );
    return rows[0] ?? null;
  }

  async disableInsurer(
    insurerId: string,
    adminId: string,
    reason: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE insurers
         SET is_manually_disabled = true,
             disabled_reason = $2,
             disabled_by_admin_id = $3,
             updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL`,
        [insurerId, reason, adminId],
      );
      await manager.query(
        `INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, entity_id, payload, timestamp)
         VALUES (
           gen_random_uuid(),
           NULL,
           $2,
           'insurer.manual_fallback.activated',
           'insurer',
           $1,
           jsonb_build_object('reason', $3, 'admin_id', $2),
           NOW()
         )`,
        [insurerId, adminId, reason],
      );
    });
  }

  async enableInsurer(insurerId: string, adminId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE insurers
         SET is_manually_disabled = false,
             disabled_reason = NULL,
             disabled_by_admin_id = NULL,
             updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL`,
        [insurerId],
      );
      await manager.query(
        `INSERT INTO audit_log (id, tenant_id, user_id, action, entity_type, entity_id, payload, timestamp)
         VALUES (
           gen_random_uuid(),
           NULL,
           $2,
           'insurer.manual_fallback.deactivated',
           'insurer',
           $1,
           jsonb_build_object('admin_id', $2),
           NOW()
         )`,
        [insurerId, adminId],
      );
    });
  }
}
