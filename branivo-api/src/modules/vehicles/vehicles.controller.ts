import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { ValidateVehicleDto } from './dto/validate-vehicle.dto';
import { VehicleValidationResultDto } from './dto/vehicle-validation-result.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { VehicleResponseDto } from './dto/vehicle-response.dto';
import { ClientJwtAuthGuard } from '../clients/guards/client-jwt-auth.guard';
import { CurrentUser } from '../clients/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(
    @Body() dto: ValidateVehicleDto,
    @Headers('x-session-token') sessionToken: string,
  ): Promise<VehicleValidationResultDto> {
    return this.vehiclesService.validateVehicle(dto, sessionToken ?? '');
  }

  @Post()
  @UseGuards(ClientJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async save(
    @Body() dto: CreateVehicleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VehicleResponseDto> {
    return this.vehiclesService.saveVehicle(dto, user.userId, user.tenantId);
  }

  @Get()
  @UseGuards(ClientJwtAuthGuard)
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VehicleResponseDto[]> {
    return this.vehiclesService.listVehicles(user.userId);
  }

  @Get(':id')
  @UseGuards(ClientJwtAuthGuard)
  async getOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VehicleResponseDto> {
    return this.vehiclesService.getVehicle(user.userId, id);
  }
}
