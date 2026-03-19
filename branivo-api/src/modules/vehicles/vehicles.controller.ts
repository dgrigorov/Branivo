import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { ValidateVehicleDto } from './dto/validate-vehicle.dto';
import { VehicleValidationResultDto } from './dto/vehicle-validation-result.dto';

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
}
