import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { UsersRepository } from '../users/users.repository';
import { FleetDriverRepository } from './fleet-driver.repository';
import { DriverVehicleResponseDto } from './dto/driver-vehicle-response.dto';

@Injectable()
export class FleetDriverService {
  constructor(
    private readonly fleetDriverRepository: FleetDriverRepository,
    private readonly usersRepository: UsersRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async getDriverView(userId: string): Promise<DriverVehicleResponseDto[]> {
    const tenantId = this.tenantContext.getTenantId();
    const rows =
      await this.fleetDriverRepository.findDriverVehiclesWithPolicies(
        userId,
        tenantId,
      );

    return rows.map((row) => ({
      vehicleId: row.vehicle_id,
      licensePlate: row.license_plate,
      make: row.make,
      model: row.model,
      insurerName: row.insurer_name,
      policyExpiresAt: row.policy_expires_at
        ? new Date(row.policy_expires_at)
        : null,
      policyStatus: row.policy_status,
    }));
  }

  async assignDriver(
    vehicleId: string,
    driverUserId: string | null,
  ): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();

    if (driverUserId !== null) {
      const driver = await this.usersRepository.findByIdAndTenant(
        driverUserId,
        tenantId,
      );
      if (!driver || driver.role !== 'driver') {
        throw new BadRequestException('User is not a driver in this tenant');
      }
    }

    await this.fleetDriverRepository.assignDriver(
      vehicleId,
      tenantId,
      driverUserId,
    );
  }
}
