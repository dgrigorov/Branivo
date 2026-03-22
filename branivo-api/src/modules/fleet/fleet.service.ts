import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { FleetRepository } from './fleet.repository';
import {
  FleetVehicleResponseDto,
  FleetVehicleStatus,
} from './dto/fleet-vehicle-response.dto';
import { FleetVehicleFilterDto } from './dto/fleet-vehicle-filter.dto';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  timestamp: string;
}

@Injectable()
export class FleetService {
  constructor(
    private readonly fleetRepository: FleetRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async getFleetVehicles(filter: FleetVehicleFilterDto): Promise<{
    data: FleetVehicleResponseDto[];
    meta: PaginationMeta;
  }> {
    const tenantId = this.tenantContext.getTenantId();
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const { items, total } = await this.fleetRepository.findFleetVehicles(
      tenantId,
      filter,
    );

    const allMapped = items.map((row) => {
      const status = this.calculateStatus(
        row.policy_expires_at ? new Date(row.policy_expires_at) : null,
      );
      return {
        id: row.id,
        vehicleId: row.vehicle_id,
        licensePlate: row.license_plate,
        make: row.make,
        model: row.model,
        insurerName: row.insurer_name,
        policyExpiresAt: row.policy_expires_at
          ? new Date(row.policy_expires_at)
          : null,
        activePolicyId: row.active_policy_id ?? null,
        status,
      } satisfies FleetVehicleResponseDto;
    });

    const data = filter.status
      ? allMapped.filter((v) => v.status === filter.status)
      : allMapped;

    return {
      data,
      meta: {
        total: filter.status ? data.length : total,
        page,
        limit,
        timestamp: new Date().toISOString(),
      },
    };
  }

  calculateStatus(policyExpiresAt: Date | null): FleetVehicleStatus {
    if (!policyExpiresAt) return 'red';
    const now = new Date();
    const daysUntilExpiry = Math.floor(
      (policyExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysUntilExpiry > 30) return 'green';
    if (daysUntilExpiry >= 1) return 'yellow';
    return 'red';
  }
}
