import { Controller, Get, Query } from '@nestjs/common';
import {
  VehicleMakeDto,
  VehicleMakeQueryDto,
  VehicleModelDto,
  VehicleModelQueryDto,
} from './dto/vehicle-catalog.dto';
import { VehicleCatalogService } from './vehicle-catalog.service';

@Controller('vehicle-catalog')
export class VehicleCatalogController {
  constructor(private readonly vehicleCatalogService: VehicleCatalogService) {}

  @Get('makes')
  async listMakes(
    @Query() query: VehicleMakeQueryDto,
  ): Promise<VehicleMakeDto[]> {
    return this.vehicleCatalogService.listMakes(query);
  }

  @Get('models')
  async listModels(
    @Query() query: VehicleModelQueryDto,
  ): Promise<VehicleModelDto[]> {
    return this.vehicleCatalogService.listModels(query);
  }
}
