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
import { VehicleCatalogService } from './vehicle-catalog.service';

@Controller('admin/vehicle-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'admin')
export class AdminVehicleCatalogController {
  constructor(private readonly vehicleCatalogService: VehicleCatalogService) {}

  // ─── Makes ────────────────────────────────────────────────────────────────

  @Get('makes')
  async listMakes(
    @Query() query: VehicleMakeQueryDto,
  ): Promise<VehicleMakeDto[]> {
    return this.vehicleCatalogService.listMakes({
      ...query,
      includeInactive: true,
    });
  }

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

  // ─── Models ───────────────────────────────────────────────────────────────

  @Get('models')
  async listModels(
    @Query() query: VehicleModelQueryDto,
  ): Promise<VehicleModelDto[]> {
    return this.vehicleCatalogService.listModels({
      ...query,
      includeInactive: true,
    });
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

  // ─── Modifications ────────────────────────────────────────────────────────

  @Get('modifications')
  async listModifications(
    @Query() query: VehicleModificationQueryDto,
  ): Promise<VehicleModificationDto[]> {
    return this.vehicleCatalogService.listModifications({
      ...query,
      includeInactive: true,
    });
  }

  @Post('modifications')
  @HttpCode(HttpStatus.CREATED)
  async createModification(
    @Body() dto: CreateVehicleModificationDto,
  ): Promise<VehicleModificationDto> {
    return this.vehicleCatalogService.createModification(dto);
  }

  @Patch('modifications/:id')
  async updateModification(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleModificationDto,
  ): Promise<VehicleModificationDto> {
    return this.vehicleCatalogService.updateModification(id, dto);
  }

  @Delete('modifications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteModification(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.vehicleCatalogService.deleteModification(id);
  }
}
