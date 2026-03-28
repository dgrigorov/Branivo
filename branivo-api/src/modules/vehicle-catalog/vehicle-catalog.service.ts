import { Injectable } from '@nestjs/common';
import {
  CreateVehicleMakeDto,
  CreateVehicleModelDto,
  CreateVehicleModificationDto,
  UpdateVehicleMakeDto,
  UpdateVehicleModelDto,
  UpdateVehicleModificationDto,
  VehicleMakeDto,
  VehicleMakeQueryDto,
  VehicleModelDto,
  VehicleModelQueryDto,
  VehicleModificationDto,
  VehicleModificationQueryDto,
} from './dto/vehicle-catalog.dto';
import { VehicleMakeService } from './vehicle-make.service';
import { VehicleModelService } from './vehicle-model.service';
import { VehicleModificationService } from './vehicle-modification.service';

@Injectable()
export class VehicleCatalogService {
  constructor(
    private readonly makes: VehicleMakeService,
    private readonly models: VehicleModelService,
    private readonly modifications: VehicleModificationService,
  ) {}

  async listMakes(query: VehicleMakeQueryDto): Promise<VehicleMakeDto[]> {
    return this.makes.list(query);
  }

  async createMake(dto: CreateVehicleMakeDto): Promise<VehicleMakeDto> {
    return this.makes.create(dto);
  }

  async updateMake(
    id: string,
    dto: UpdateVehicleMakeDto,
  ): Promise<VehicleMakeDto> {
    return this.makes.update(id, dto);
  }

  async deleteMake(id: string): Promise<void> {
    return this.makes.delete(id);
  }

  async listModels(query: VehicleModelQueryDto): Promise<VehicleModelDto[]> {
    return this.models.list(query);
  }

  async createModel(dto: CreateVehicleModelDto): Promise<VehicleModelDto> {
    return this.models.create(dto);
  }

  async updateModel(
    id: string,
    dto: UpdateVehicleModelDto,
  ): Promise<VehicleModelDto> {
    return this.models.update(id, dto);
  }

  async deleteModel(id: string): Promise<void> {
    return this.models.delete(id);
  }

  async listModifications(
    query: VehicleModificationQueryDto,
  ): Promise<VehicleModificationDto[]> {
    return this.modifications.list(query);
  }

  async createModification(
    dto: CreateVehicleModificationDto,
  ): Promise<VehicleModificationDto> {
    return this.modifications.create(dto);
  }

  async updateModification(
    id: string,
    dto: UpdateVehicleModificationDto,
  ): Promise<VehicleModificationDto> {
    return this.modifications.update(id, dto);
  }

  async deleteModification(id: string): Promise<void> {
    return this.modifications.delete(id);
  }
}
