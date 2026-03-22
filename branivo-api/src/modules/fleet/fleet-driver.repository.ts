import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface DriverVehicleRow {
  vehicle_id: string;
  license_plate: string;
  make: string;
  model: string;
  insurer_name: string | null;
  policy_expires_at: Date | null;
  policy_status: string | null;
}

@Injectable()
export class FleetDriverRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findDriverVehiclesWithPolicies(
    userId: string,
    tenantId: string,
  ): Promise<DriverVehicleRow[]> {
    return this.dataSource.query<DriverVehicleRow[]>(
      `
      SELECT
        fv.vehicle_id,
        v.license_plate,
        v.make,
        v.model,
        i.name AS insurer_name,
        p.coverage_end_date AS policy_expires_at,
        p.status AS policy_status
      FROM fleet_vehicles fv
      JOIN vehicles v ON v.id = fv.vehicle_id AND v.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT pol.coverage_end_date, pol.insurer_id, pol.status
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
        AND fv.driver_user_id = $2
        AND fv.deleted_at IS NULL
      ORDER BY v.license_plate
      `,
      [tenantId, userId],
    );
  }

  async assignDriver(
    vehicleId: string,
    tenantId: string,
    driverUserId: string | null,
  ): Promise<void> {
    const result = await this.dataSource.query<{ id: string }[]>(
      `UPDATE fleet_vehicles
       SET driver_user_id = $1, updated_at = NOW()
       WHERE vehicle_id = $2
         AND tenant_id = $3
         AND deleted_at IS NULL
       RETURNING id`,
      [driverUserId, vehicleId, tenantId],
    );
    if (result.length === 0) {
      throw new NotFoundException('Vehicle not found in fleet');
    }
  }
}
