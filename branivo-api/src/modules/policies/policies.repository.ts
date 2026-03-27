import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { BaseRepository } from '../../common/base.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { Policy, PolicyStatus } from './entities/policy.entity';

export interface PolicyDetailsRow {
  id: string;
  tenant_id: string;
  payment_id: string;
  quote_id: string;
  end_client_id: string | null;
  insurer_id: string;
  policy_number: string;
  status: string;
  stripe_payment_intent_id: string;
  premium_amount: string;
  commission_amount: string;
  commission_pct: string;
  currency: string;
  vehicle_id: string | null;
  coverage_start_date: string | null;
  coverage_end_date: string | null;
  metadata: Record<string, unknown> | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  vehicle_vin: string | null;
  vehicle_plate: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  vehicle_engine_volume: string | null;
  vehicle_fuel_type: string | null;
  vehicle_first_registration_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyCreationDefaults {
  paymentId: string;
  quoteId: string;
  insurerId: string;
}

@Injectable()
export class PoliciesRepository extends BaseRepository<Policy> {
  constructor(
    @InjectRepository(Policy)
    private readonly policyRepo: Repository<Policy>,
    tenantContext: TenantContext,
  ) {
    super(policyRepo, tenantContext);
  }

  // НЕ tenant-scoped — webhook идва без tenant context (INSERT без RLS session)
  async saveWithoutTenantScope(entity: Partial<Policy>): Promise<Policy> {
    return this.policyRepo.save(entity as Policy);
  }

  // НЕ tenant-scoped — webhook идва без tenant context
  async findByStripeIntentId(intentId: string): Promise<Policy | null> {
    return this.policyRepo.findOne({
      where: { stripePaymentIntentId: intentId, deletedAt: IsNull() },
    });
  }

  // Tenant-scoped за public API
  async findByIdForTenant(id: string): Promise<Policy | null> {
    await this.setTenantSession();
    return this.policyRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
  }

  async activatePolicy(id: string): Promise<void> {
    // САМО status update — commission е IMMUTABLE
    await this.policyRepo.update(id, {
      status: PolicyStatus.ACTIVE,
      updatedAt: new Date(),
    });
  }

  async markFailed(id: string): Promise<void> {
    await this.policyRepo.update(id, {
      status: PolicyStatus.FAILED,
      updatedAt: new Date(),
    });
  }

  // НЕ tenant-scoped — за job context (PDF generation processor)
  async findByIdWithoutScope(id: string): Promise<Policy | null> {
    return this.policyRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
  }

  async updatePdfKeys(
    id: string,
    policyPdfKey: string,
    greenCardKey: string,
  ): Promise<void> {
    await this.policyRepo.update(id, {
      policyPdfS3Key: policyPdfKey,
      greenCardPdfS3Key: greenCardKey,
      updatedAt: new Date(),
    });
  }

  async markDocumentsEmailed(id: string): Promise<void> {
    await this.policyRepo.update(id, {
      documentsEmailedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async findByEndClientId(
    endClientId: string,
    tenantId: string,
  ): Promise<Policy[]> {
    return this.policyRepo.find({
      where: { endClientId, tenantId, deletedAt: IsNull() },
    });
  }

  async findManyByIds(
    tenantId: string,
    policyIds: string[],
  ): Promise<Policy[]> {
    if (policyIds.length === 0) return [];
    return this.policyRepo.find({
      where: { tenantId, id: In(policyIds), deletedAt: IsNull() },
    });
  }

  async listDetailedForTenant(): Promise<PolicyDetailsRow[]> {
    await this.setTenantSession();
    return this.policyRepo.query<PolicyDetailsRow[]>(
      `SELECT
         p.id,
         p.tenant_id,
         p.payment_id,
         p.quote_id,
         p.end_client_id,
         p.insurer_id,
         p.policy_number,
         p.status,
         p.stripe_payment_intent_id,
         p.premium_amount::text,
         p.commission_amount::text,
         p.commission_pct::text,
         p.currency,
         p.vehicle_id,
         p.coverage_start_date::text,
         p.coverage_end_date::text,
         p.metadata,
         ec.first_name AS owner_first_name,
         ec.last_name AS owner_last_name,
         ec.email AS owner_email,
         ec.phone_number AS owner_phone,
         v.vin AS vehicle_vin,
         v.license_plate AS vehicle_plate,
         v.make AS vehicle_make,
         v.model AS vehicle_model,
         v.year AS vehicle_year,
         v.color AS vehicle_color,
         v.engine_volume AS vehicle_engine_volume,
         v.fuel_type AS vehicle_fuel_type,
         v.first_registration_date::text AS vehicle_first_registration_date,
         p.created_at::text,
         p.updated_at::text
       FROM policies p
       LEFT JOIN end_clients ec ON ec.id = p.end_client_id AND ec.deleted_at IS NULL
       LEFT JOIN vehicles v ON v.id = p.vehicle_id AND v.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
       ORDER BY p.created_at DESC`,
    );
  }

  async findDetailedByIdForTenant(id: string): Promise<PolicyDetailsRow | null> {
    await this.setTenantSession();
    const rows = await this.policyRepo.query<PolicyDetailsRow[]>(
      `SELECT
         p.id,
         p.tenant_id,
         p.payment_id,
         p.quote_id,
         p.end_client_id,
         p.insurer_id,
         p.policy_number,
         p.status,
         p.stripe_payment_intent_id,
         p.premium_amount::text,
         p.commission_amount::text,
         p.commission_pct::text,
         p.currency,
         p.vehicle_id,
         p.coverage_start_date::text,
         p.coverage_end_date::text,
         p.metadata,
         ec.first_name AS owner_first_name,
         ec.last_name AS owner_last_name,
         ec.email AS owner_email,
         ec.phone_number AS owner_phone,
         v.vin AS vehicle_vin,
         v.license_plate AS vehicle_plate,
         v.make AS vehicle_make,
         v.model AS vehicle_model,
         v.year AS vehicle_year,
         v.color AS vehicle_color,
         v.engine_volume AS vehicle_engine_volume,
         v.fuel_type AS vehicle_fuel_type,
         v.first_registration_date::text AS vehicle_first_registration_date,
         p.created_at::text,
         p.updated_at::text
       FROM policies p
       LEFT JOIN end_clients ec ON ec.id = p.end_client_id AND ec.deleted_at IS NULL
       LEFT JOIN vehicles v ON v.id = p.vehicle_id AND v.deleted_at IS NULL
       WHERE p.id = $1 AND p.deleted_at IS NULL
       LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findVehicleOwnerForTenant(
    vehicleId: string,
  ): Promise<{ vehicleOwnerId: string; tenantId: string } | null> {
    await this.setTenantSession();
    const rows = await this.policyRepo.query<
      Array<{ vehicle_owner_id: string; tenant_id: string }>
    >(
      `SELECT owner_id AS vehicle_owner_id, tenant_id
       FROM vehicles
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [vehicleId],
    );
    const row = rows[0];
    if (!row) return null;
    return { vehicleOwnerId: row.vehicle_owner_id, tenantId: row.tenant_id };
  }

  async endClientExistsForTenant(endClientId: string): Promise<boolean> {
    await this.setTenantSession();
    const rows = await this.policyRepo.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS(
        SELECT 1
        FROM end_clients
        WHERE id = $1 AND deleted_at IS NULL
      )`,
      [endClientId],
    );
    return Boolean(rows[0]?.exists);
  }

  async getCreationDefaultsForTenant(): Promise<PolicyCreationDefaults | null> {
    await this.setTenantSession();
    const paymentRows = await this.policyRepo.query<Array<{ id: string }>>(
      `SELECT id FROM payments WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    );
    const quoteRows = await this.policyRepo.query<Array<{ id: string }>>(
      `SELECT id FROM quotes WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    );
    const insurerRows = await this.policyRepo.query<Array<{ id: string }>>(
      `SELECT id FROM insurers WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    );

    const paymentId = paymentRows[0]?.id;
    const quoteId = quoteRows[0]?.id;
    const insurerId = insurerRows[0]?.id;
    if (!paymentId || !quoteId || !insurerId) return null;

    return { paymentId, quoteId, insurerId };
  }

  async updateForTenant(id: string, patch: Partial<Policy>): Promise<void> {
    await this.setTenantSession();
    const updatePayload = {
      ...patch,
      updatedAt: new Date(),
    } as Parameters<Repository<Policy>['update']>[1];
    await this.policyRepo.update(id, updatePayload);
  }
}
