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

export interface InsurerDetailRow {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  isManuallyDisabled: boolean;
  disabledReason: string | null;
  rating: string;
  claimSpeed: string;
  extrasConfig: Record<string, unknown>;
  adapterClass: string;
  apiEndpoint: string | null;
  fscInsurerId: string | null;
  logoUrl: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  // FSC joined fields (nullable when no fscInsurerId)
  fscTrustpilotScore: string | null;
  fscTrustpilotReviewsCount: number | null;
  fscTrustpilotUrl: string | null;
  fscWebsite: string | null;
  fscOfficeAddress: string | null;
  fscContactPhone: string | null;
  fscContactEmails: string[] | null;
  fscSocialLinks: string[] | null;
  fscLogoUrl: string | null;
  fscLongDescription: string | null;
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

  async findInsurerDetailById(
    insurerId: string,
  ): Promise<InsurerDetailRow | null> {
    const rows = await this.dataSource.query<InsurerDetailRow[]>(
      `SELECT
         i.id,
         i.name,
         i.code,
         i.is_active              AS "isActive",
         i.is_manually_disabled   AS "isManuallyDisabled",
         i.disabled_reason        AS "disabledReason",
         i.rating,
         i.claim_speed            AS "claimSpeed",
         i.extras_config          AS "extrasConfig",
         i.adapter_class          AS "adapterClass",
         i.api_endpoint           AS "apiEndpoint",
         i.fsc_insurer_id         AS "fscInsurerId",
         i.logo_url               AS "logoUrl",
         i.description,
         i.created_at             AS "createdAt",
         i.updated_at             AS "updatedAt",
         f.trustpilot_score       AS "fscTrustpilotScore",
         f.trustpilot_reviews_count AS "fscTrustpilotReviewsCount",
         f.trustpilot_url         AS "fscTrustpilotUrl",
         f.website                AS "fscWebsite",
         f.office_address         AS "fscOfficeAddress",
         f.contact_phone          AS "fscContactPhone",
         f.contact_emails         AS "fscContactEmails",
         f.social_links           AS "fscSocialLinks",
         f.logo_url               AS "fscLogoUrl",
         f.long_description       AS "fscLongDescription"
       FROM insurers i
       LEFT JOIN fsc_insurers f ON f.id = i.fsc_insurer_id
                                AND f.deleted_at IS NULL
       WHERE i.id = $1
         AND i.deleted_at IS NULL`,
      [insurerId],
    );
    return rows[0] ?? null;
  }

  async updateInsurerConfig(
    insurerId: string,
    fields: {
      name?: string;
      adapterClass?: string;
      apiEndpoint?: string | null;
      fscInsurerId?: string | null;
      logoUrl?: string | null;
      description?: string | null;
      rating?: number;
      claimSpeed?: number;
    },
  ): Promise<void> {
    const setClauses: string[] = [];
    const params: unknown[] = [insurerId];
    let idx = 2;

    const add = (col: string, val: unknown): void => {
      setClauses.push(`${col} = $${idx++}`);
      params.push(val);
    };

    if (fields.name !== undefined) add('name', fields.name);
    if (fields.adapterClass !== undefined)
      add('adapter_class', fields.adapterClass);
    if (fields.apiEndpoint !== undefined)
      add('api_endpoint', fields.apiEndpoint);
    if (fields.fscInsurerId !== undefined)
      add('fsc_insurer_id', fields.fscInsurerId);
    if (fields.logoUrl !== undefined) add('logo_url', fields.logoUrl);
    if (fields.description !== undefined)
      add('description', fields.description);
    if (fields.rating !== undefined) add('rating', fields.rating);
    if (fields.claimSpeed !== undefined) add('claim_speed', fields.claimSpeed);

    if (setClauses.length === 0) return;

    setClauses.push('updated_at = NOW()');

    await this.dataSource.query(
      `UPDATE insurers SET ${setClauses.join(', ')} WHERE id = $1 AND deleted_at IS NULL`,
      params,
    );
  }

  async setApiKey(insurerId: string, encryptedKey: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE insurers SET api_key_enc = $2, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [insurerId, encryptedKey],
    );
  }

  async getApiEndpoint(insurerId: string): Promise<string | null> {
    const rows = await this.dataSource.query<
      Array<{ apiEndpoint: string | null }>
    >(
      `SELECT api_endpoint AS "apiEndpoint" FROM insurers WHERE id = $1 AND deleted_at IS NULL`,
      [insurerId],
    );
    return rows[0]?.apiEndpoint ?? null;
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
