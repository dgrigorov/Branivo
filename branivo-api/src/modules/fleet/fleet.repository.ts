import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BaseRepository } from '../../common/base.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { FleetVehicle } from './entities/fleet-vehicle.entity';
import { FleetVehicleFilterDto } from './dto/fleet-vehicle-filter.dto';

export interface FleetVehicleWithVehicleData {
  id: string;
  vehicle_id: string;
  license_plate: string;
  make: string;
  model: string;
  vin: string;
  year: number;
}

export interface FleetVehicleWithPolicy {
  id: string;
  vehicle_id: string;
  license_plate: string;
  make: string;
  model: string;
  insurer_name: string | null;
  policy_expires_at: Date | null;
  active_policy_id: string | null;
}

@Injectable()
export class FleetRepository extends BaseRepository<FleetVehicle> {
  constructor(
    @InjectRepository(FleetVehicle)
    private readonly fleetRepo: Repository<FleetVehicle>,
    tenantContext: TenantContext,
    private readonly dataSource: DataSource,
  ) {
    super(fleetRepo, tenantContext);
  }

  async findFleetVehicles(
    tenantId: string,
    filter: FleetVehicleFilterDto,
  ): Promise<{ items: FleetVehicleWithPolicy[]; total: number }> {
    const limit = filter.limit ?? 20;
    const page = filter.page ?? 1;
    const offset = (page - 1) * limit;

    const rows = await this.dataSource.query<FleetVehicleWithPolicy[]>(
      `
      SELECT
        fv.id,
        fv.vehicle_id,
        v.license_plate,
        v.make,
        v.model,
        i.name AS insurer_name,
        p.coverage_end_date AS policy_expires_at,
        p.id AS active_policy_id
      FROM fleet_vehicles fv
      JOIN vehicles v ON v.id = fv.vehicle_id AND v.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT pol.id, pol.coverage_end_date, pol.insurer_id
        FROM policies pol
        WHERE pol.vehicle_id = fv.vehicle_id
          AND pol.tenant_id = $1
          AND pol.status = 'active'
          AND pol.deleted_at IS NULL
        ORDER BY pol.created_at DESC
        LIMIT 1
      ) p ON true
      LEFT JOIN insurers i ON i.id = p.insurer_id
      WHERE fv.tenant_id = $1
        AND fv.deleted_at IS NULL
      ORDER BY fv.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [tenantId, limit, offset],
    );

    const countRows = await this.dataSource.query<{ count: string }[]>(
      `
      SELECT COUNT(*)::text AS count
      FROM fleet_vehicles fv
      JOIN vehicles v ON v.id = fv.vehicle_id AND v.deleted_at IS NULL
      WHERE fv.tenant_id = $1
        AND fv.deleted_at IS NULL
      `,
      [tenantId],
    );

    const total = parseInt(countRows[0]?.count ?? '0', 10);
    return { items: rows, total };
  }

  async findManyByIds(
    tenantId: string,
    vehicleIds: string[],
  ): Promise<FleetVehicleWithVehicleData[]> {
    if (vehicleIds.length === 0) return [];
    return this.dataSource.query<FleetVehicleWithVehicleData[]>(
      `
      SELECT fv.id, fv.vehicle_id, v.license_plate, v.make, v.model, v.vin, v.year
      FROM fleet_vehicles fv
      JOIN vehicles v ON v.id = fv.vehicle_id AND v.deleted_at IS NULL
      WHERE fv.tenant_id = $1
        AND fv.id = ANY($2)
        AND fv.deleted_at IS NULL
      `,
      [tenantId, vehicleIds],
    );
  }
}
