import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { Policy } from './entities/policy.entity';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import {
  PolicyDetailsRow,
  PoliciesRepository,
  PolicyCreationDefaults,
} from './policies.repository';

export interface PolicyDetailsDto {
  id: string;
  tenantId: string;
  paymentId: string;
  quoteId: string;
  insurerId: string;
  policyNumber: string;
  status: string;
  stripePaymentIntentId: string;
  premiumAmount: number;
  commissionAmount: number;
  commissionPct: number;
  currency: string;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  metadata: Record<string, unknown>;
  owner: {
    id: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phoneNumber: string | null;
  };
  vehicle: {
    id: string | null;
    vin: string | null;
    licensePlate: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    color: string | null;
    engineVolume: string | null;
    fuelType: string | null;
    firstRegistrationDate: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PoliciesService {
  constructor(
    private readonly policiesRepo: PoliciesRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  // Tenant-scoped: за broker/end-client достъп до полиците
  async findPolicyById(id: string): Promise<Policy | null> {
    return this.policiesRepo.findByIdForTenant(id);
  }

  async listPoliciesDetailed(): Promise<PolicyDetailsDto[]> {
    const rows = await this.policiesRepo.listDetailedForTenant();
    return rows.map((row) => this.mapDetailsRow(row));
  }

  async getPolicyDetailedById(id: string): Promise<PolicyDetailsDto> {
    const row = await this.policiesRepo.findDetailedByIdForTenant(id);
    if (!row) throw new NotFoundException('Policy not found');
    return this.mapDetailsRow(row);
  }

  async createPolicy(dto: CreatePolicyDto): Promise<PolicyDetailsDto> {
    const defaults = await this.resolveCreationDefaults(dto);
    await this.validateOwnerVehicle(dto.ownerId, dto.vehicleId);

    const randomSuffix = Math.random().toString(36).slice(2, 10);
    const policy = await this.policiesRepo.save({
      tenantId: this.tenantContext.getTenantId(),
      paymentId: defaults.paymentId,
      quoteId: defaults.quoteId,
      insurerId: defaults.insurerId,
      endClientId: dto.ownerId,
      vehicleId: dto.vehicleId,
      policyNumber: dto.policyNumber,
      status: (dto.status ?? 'active') as Policy['status'],
      stripePaymentIntentId:
        dto.stripePaymentIntentId ??
        `pi_manual_${Date.now()}_${randomSuffix}`,
      premiumAmount: dto.premiumAmount,
      commissionAmount: dto.commissionAmount ?? 0,
      commissionPct: dto.commissionPct ?? 0,
      currency: dto.currency ?? 'BGN',
      coverageStartDate: dto.coverageStartDate
        ? new Date(dto.coverageStartDate)
        : undefined,
      coverageEndDate: dto.coverageEndDate
        ? new Date(dto.coverageEndDate)
        : undefined,
      metadata: dto.metadata ?? {},
    });

    return this.getPolicyDetailedById(policy.id);
  }

  async updatePolicy(id: string, dto: UpdatePolicyDto): Promise<PolicyDetailsDto> {
    const existing = await this.policiesRepo.findByIdForTenant(id);
    if (!existing) throw new NotFoundException('Policy not found');

    if (dto.ownerId || dto.vehicleId) {
      const resolvedOwnerId = dto.ownerId ?? existing.endClientId;
      const resolvedVehicleId = dto.vehicleId ?? existing.vehicleId;
      if (!resolvedOwnerId || !resolvedVehicleId) {
        throw new BadRequestException(
          'Both owner and vehicle are required when linking policy ownership',
        );
      }
      await this.validateOwnerVehicle(resolvedOwnerId, resolvedVehicleId);
    }

    await this.policiesRepo.updateForTenant(id, {
      endClientId: dto.ownerId ?? existing.endClientId,
      vehicleId: dto.vehicleId ?? existing.vehicleId,
      policyNumber: dto.policyNumber ?? existing.policyNumber,
      status: (dto.status ?? existing.status) as Policy['status'],
      premiumAmount: dto.premiumAmount ?? existing.premiumAmount,
      commissionAmount: dto.commissionAmount ?? existing.commissionAmount,
      commissionPct: dto.commissionPct ?? existing.commissionPct,
      currency: dto.currency ?? existing.currency,
      coverageStartDate: dto.coverageStartDate
        ? new Date(dto.coverageStartDate)
        : existing.coverageStartDate,
      coverageEndDate: dto.coverageEndDate
        ? new Date(dto.coverageEndDate)
        : existing.coverageEndDate,
      metadata: dto.metadata ?? existing.metadata,
    });

    return this.getPolicyDetailedById(id);
  }

  async deletePolicy(id: string): Promise<void> {
    const existing = await this.policiesRepo.findByIdForTenant(id);
    if (!existing) throw new NotFoundException('Policy not found');
    await this.policiesRepo.softDelete(id);
  }

  private async resolveCreationDefaults(
    dto: CreatePolicyDto,
  ): Promise<PolicyCreationDefaults> {
    if (dto.paymentId && dto.quoteId && dto.insurerId) {
      return {
        paymentId: dto.paymentId,
        quoteId: dto.quoteId,
        insurerId: dto.insurerId,
      };
    }
    const defaults = await this.policiesRepo.getCreationDefaultsForTenant();
    if (!defaults) {
      throw new BadRequestException(
        'Cannot create policy: missing default payment/quote/insurer for this tenant',
      );
    }
    return {
      paymentId: dto.paymentId ?? defaults.paymentId,
      quoteId: dto.quoteId ?? defaults.quoteId,
      insurerId: dto.insurerId ?? defaults.insurerId,
    };
  }

  private async validateOwnerVehicle(
    ownerId: string,
    vehicleId: string,
  ): Promise<void> {
    const ownerExists = await this.policiesRepo.endClientExistsForTenant(ownerId);
    if (!ownerExists) {
      throw new BadRequestException('Owner is not found in current tenant');
    }

    const vehicleOwner = await this.policiesRepo.findVehicleOwnerForTenant(vehicleId);
    if (!vehicleOwner) {
      throw new BadRequestException('Vehicle is not found in current tenant');
    }

    if (vehicleOwner.vehicleOwnerId !== ownerId) {
      throw new BadRequestException(
        'Vehicle owner mismatch: selected vehicle does not belong to selected owner',
      );
    }
  }

  private mapDetailsRow(row: PolicyDetailsRow): PolicyDetailsDto {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      paymentId: row.payment_id,
      quoteId: row.quote_id,
      insurerId: row.insurer_id,
      policyNumber: row.policy_number,
      status: row.status,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      premiumAmount: Number(row.premium_amount),
      commissionAmount: Number(row.commission_amount),
      commissionPct: Number(row.commission_pct),
      currency: row.currency,
      coverageStartDate: row.coverage_start_date,
      coverageEndDate: row.coverage_end_date,
      metadata: row.metadata ?? {},
      owner: {
        id: row.end_client_id,
        firstName: row.owner_first_name,
        lastName: row.owner_last_name,
        email: row.owner_email,
        phoneNumber: row.owner_phone,
      },
      vehicle: {
        id: row.vehicle_id,
        vin: row.vehicle_vin,
        licensePlate: row.vehicle_plate,
        make: row.vehicle_make,
        model: row.vehicle_model,
        year: row.vehicle_year,
        color: row.vehicle_color,
        engineVolume: row.vehicle_engine_volume,
        fuelType: row.vehicle_fuel_type,
        firstRegistrationDate: row.vehicle_first_registration_date,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
