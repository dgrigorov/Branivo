import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateVehicleMakeDto,
  CreateVehicleModelDto,
  SyncVpicMakesResponseDto,
  SyncVpicModelsResponseDto,
  UpdateVehicleMakeDto,
  UpdateVehicleModelDto,
  VehicleMakeDto,
  VehicleMakeQueryDto,
  VehicleModelDto,
  VehicleModelQueryDto,
} from './dto/vehicle-catalog.dto';
import { VehicleCatalogService } from './vehicle-catalog.service';

@Controller('admin/vehicle-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'admin')
export class AdminVehicleCatalogController {
  constructor(private readonly vehicleCatalogService: VehicleCatalogService) {}

  @Post('makes')
  @HttpCode(HttpStatus.CREATED)
  async createMake(@Body() dto: CreateVehicleMakeDto): Promise<VehicleMakeDto> {
    return this.vehicleCatalogService.createMake(dto);
  }

  @Patch('makes/:id')
  async updateMake(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleMakeDto,
  ): Promise<VehicleMakeDto> {
    return this.vehicleCatalogService.updateMake(id, dto);
  }

  @Delete('makes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMake(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.vehicleCatalogService.deleteMake(id);
  }

  @Post('models')
  @HttpCode(HttpStatus.CREATED)
  async createModel(
    @Body() dto: CreateVehicleModelDto,
  ): Promise<VehicleModelDto> {
    return this.vehicleCatalogService.createModel(dto);
  }

  @Patch('models/:id')
  async updateModel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleModelDto,
  ): Promise<VehicleModelDto> {
    return this.vehicleCatalogService.updateModel(id, dto);
  }

  @Delete('models/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteModel(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.vehicleCatalogService.deleteModel(id);
  }

  @Post('sync/vpic/makes')
  async syncMakesFromVpic(): Promise<SyncVpicMakesResponseDto> {
    return this.vehicleCatalogService.syncMakesFromVpic();
  }

  @Post('sync/vpic/makes/:makeId/models')
  async syncModelsFromVpic(
    @Param('makeId', ParseUUIDPipe) makeId: string,
  ): Promise<SyncVpicModelsResponseDto> {
    return this.vehicleCatalogService.syncModelsFromVpic(makeId);
  }

  @Get('makes')
  async listMakes(@Query() query: VehicleMakeQueryDto): Promise<VehicleMakeDto[]> {
    return this.vehicleCatalogService.listMakes({
      ...query,
      includeInactive: true,
    });
  }

  @Get('models')
  async listModels(
    @Query() query: VehicleModelQueryDto,
  ): Promise<VehicleModelDto[]> {
    return this.vehicleCatalogService.listModels({
      ...query,
      includeInactive: true,
    });
  }
}
