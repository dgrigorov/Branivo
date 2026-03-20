import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../common/base.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { Vehicle } from './entities/vehicle.entity';

@Injectable()
export class VehiclesRepository extends BaseRepository<Vehicle> {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    tenantContext: TenantContext,
  ) {
    super(vehicleRepo, tenantContext);
  }

  async findByOwner(ownerId: string): Promise<Vehicle[]> {
    return this.findAll({ ownerId } as Parameters<typeof this.findAll>[0]);
  }

  async findByOwnerAndId(
    ownerId: string,
    vehicleId: string,
  ): Promise<Vehicle | null> {
    return this.findOne({
      id: vehicleId,
      ownerId,
    } as Parameters<typeof this.findOne>[0]);
  }
}
