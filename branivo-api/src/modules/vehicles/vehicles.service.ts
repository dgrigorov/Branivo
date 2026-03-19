import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { KatApiAdapter } from './adapters/kat-api.adapter';
import { GarantsionenFondAdapter } from './adapters/garantsionen-fond.adapter';
import { KatApiUnavailableError } from './exceptions/kat-api-unavailable.exception';
import { GfApiUnavailableError } from './exceptions/gf-api-unavailable.exception';
import { VehicleBlockedByGfException } from './exceptions/vehicle-blocked-by-gf.exception';
import { ValidateVehicleDto } from './dto/validate-vehicle.dto';
import { VehicleValidationResultDto } from './dto/vehicle-validation-result.dto';

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;
const SESSION_TTL_SECONDS = 172800; // 48h

interface AnonSessionData {
  session_id?: string;
  tenant_id?: string;
  vehicle_data?: Record<string, unknown>;
  [key: string]: unknown;
}

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly katApiAdapter: KatApiAdapter,
    private readonly gfAdapter: GarantsionenFondAdapter,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async validateVehicle(
    dto: ValidateVehicleDto,
    sessionToken: string,
  ): Promise<VehicleValidationResultDto> {
    if (!VIN_REGEX.test(dto.vin)) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'VIN невалиден формат',
        error: 'Unprocessable Entity',
      });
    }

    const katStatus = await this.runKatValidation(dto.vin);

    if (katStatus === 'failed') {
      // GF never checked when KAT fails — report as 'unavailable' (not 'clean')
      const result = this.buildResult(false, katStatus, 'unavailable');
      await this.updateValidationStatus(sessionToken, result);
      return result;
    }

    let gfStatus: VehicleValidationResultDto['gfStatus'];
    try {
      gfStatus = await this.runGfCheck(dto.vin, dto.licensePlate);
    } catch (err) {
      if (err instanceof VehicleBlockedByGfException) {
        const blocked = this.buildResult(false, katStatus, 'flagged');
        await this.updateValidationStatus(sessionToken, blocked);
        throw err;
      }
      throw err;
    }

    // Reaching here means clean or unavailable (flagged throws above)
    const result = this.buildResult(true, katStatus, gfStatus);
    await this.updateValidationStatus(sessionToken, result);
    return result;
  }

  private async runKatValidation(
    vin: string,
  ): Promise<VehicleValidationResultDto['katStatus']> {
    try {
      const katResult = await this.katApiAdapter.validateVin(vin);
      if (katResult.status === 'stolen' || katResult.status === 'invalid') {
        return 'failed';
      }
      return 'ok';
    } catch (err) {
      if (err instanceof KatApiUnavailableError) {
        return 'manual_fallback';
      }
      this.logger.error('KAT validation unexpected error', err);
      return 'unavailable';
    }
  }

  private async runGfCheck(
    vin: string,
    licensePlate: string,
  ): Promise<VehicleValidationResultDto['gfStatus']> {
    try {
      const gfResult = await this.gfAdapter.checkVehicle(vin, licensePlate);
      if (gfResult.flagged) {
        throw new VehicleBlockedByGfException();
      }
      return 'clean';
    } catch (err) {
      if (err instanceof VehicleBlockedByGfException) throw err;
      if (err instanceof GfApiUnavailableError) {
        return 'unavailable';
      }
      this.logger.error('GF check unexpected error', err);
      return 'unavailable';
    }
  }

  private buildResult(
    canProceedToQuote: boolean,
    katStatus: VehicleValidationResultDto['katStatus'],
    gfStatus: VehicleValidationResultDto['gfStatus'],
  ): VehicleValidationResultDto {
    return {
      canProceedToQuote,
      katStatus,
      gfStatus,
      vinValid: true,
      validatedAt: new Date().toISOString(),
    };
  }

  private async updateValidationStatus(
    sessionToken: string,
    result: VehicleValidationResultDto,
  ): Promise<void> {
    if (!sessionToken) return;

    const sessionKey = `anon:${sessionToken}:session`;
    try {
      const existing = await this.redis.get(sessionKey);
      if (!existing) return;

      const sessionData = JSON.parse(existing) as AnonSessionData;
      sessionData.vehicle_data = {
        ...sessionData.vehicle_data,
        validation_status: result.canProceedToQuote
          ? 'validated'
          : 'gf_blocked',
        can_proceed_to_quote: result.canProceedToQuote,
        kat_status: result.katStatus,
        gf_status: result.gfStatus,
        validated_at: result.validatedAt,
      };

      await this.redis.setex(
        sessionKey,
        SESSION_TTL_SECONDS,
        JSON.stringify(sessionData),
      );
    } catch (err) {
      this.logger.error('Failed to update session validation status', err);
    }
  }
}
