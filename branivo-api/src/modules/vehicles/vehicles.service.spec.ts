import { UnprocessableEntityException } from '@nestjs/common';
import Redis from 'ioredis';
import { VehiclesService } from './vehicles.service';
import { KatApiAdapter } from './adapters/kat-api.adapter';
import { GarantsionenFondAdapter } from './adapters/garantsionen-fond.adapter';
import { KatApiUnavailableError } from './exceptions/kat-api-unavailable.exception';
import { GfApiUnavailableError } from './exceptions/gf-api-unavailable.exception';
import { VehicleBlockedByGfException } from './exceptions/vehicle-blocked-by-gf.exception';
import { ValidateVehicleDto } from './dto/validate-vehicle.dto';

const VALID_VIN = 'WVWZZZ3BZ3E123456';
const SESSION_TOKEN = 'test-session-token';
const LICENSE_PLATE = 'СА1234АА';

const mockKatAdapter = {
  validateVin: jest.fn(),
};

const mockGfAdapter = {
  checkVehicle: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue('OK'),
};

function buildService(): VehiclesService {
  return new VehiclesService(
    mockKatAdapter as unknown as KatApiAdapter,
    mockGfAdapter as unknown as GarantsionenFondAdapter,
    mockRedis as unknown as Redis,
  );
}

function validDto(
  overrides: Partial<ValidateVehicleDto> = {},
): ValidateVehicleDto {
  return Object.assign(new ValidateVehicleDto(), {
    vin: VALID_VIN,
    licensePlate: LICENSE_PLATE,
    ...overrides,
  });
}

describe('VehiclesService', () => {
  let service: VehiclesService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(
      JSON.stringify({
        session_id: SESSION_TOKEN,
        tenant_id: 'tid',
        vehicle_data: {},
      }),
    );
    service = buildService();
  });

  // Test 1: VIN invalid format → UnprocessableEntityException
  it('VIN invalid format → 422 UnprocessableEntityException', async () => {
    const dto = validDto({ vin: 'INVALID_VIN_123' });
    await expect(service.validateVehicle(dto, SESSION_TOKEN)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(mockKatAdapter.validateVin).not.toHaveBeenCalled();
  });

  // Test 2: KAT OK + GF clean → canProceedToQuote: true, session updated
  it('KAT OK + GF clean → canProceedToQuote: true, session updated', async () => {
    mockKatAdapter.validateVin.mockResolvedValue({
      available: true,
      status: 'ok',
    });
    mockGfAdapter.checkVehicle.mockResolvedValue({
      flagged: false,
      source: 'api',
    });

    const result = await service.validateVehicle(validDto(), SESSION_TOKEN);

    expect(result.canProceedToQuote).toBe(true);
    expect(result.katStatus).toBe('ok');
    expect(result.gfStatus).toBe('clean');
    expect(result.vinValid).toBe(true);
    expect(mockRedis.setex).toHaveBeenCalledWith(
      `anon:${SESSION_TOKEN}:session`,
      172800,
      expect.stringContaining('"validation_status":"validated"'),
    );
  });

  // Test 3: KAT timeout (unavailable) + GF clean → katStatus: 'manual_fallback', canProceedToQuote: true
  it('KAT unavailable + GF clean → manual_fallback, canProceedToQuote: true', async () => {
    mockKatAdapter.validateVin.mockRejectedValue(new KatApiUnavailableError());
    mockGfAdapter.checkVehicle.mockResolvedValue({
      flagged: false,
      source: 'api',
    });

    const result = await service.validateVehicle(validDto(), SESSION_TOKEN);

    expect(result.katStatus).toBe('manual_fallback');
    expect(result.canProceedToQuote).toBe(true);
  });

  // Test 4: KAT OK + GF flagged → VehicleBlockedByGfException, session updated with gf_blocked
  it('KAT OK + GF flagged → VehicleBlockedByGfException, session gf_blocked', async () => {
    mockKatAdapter.validateVin.mockResolvedValue({
      available: true,
      status: 'ok',
    });
    mockGfAdapter.checkVehicle.mockResolvedValue({
      flagged: true,
      source: 'api',
    });

    await expect(
      service.validateVehicle(validDto(), SESSION_TOKEN),
    ).rejects.toThrow(VehicleBlockedByGfException);

    expect(mockRedis.setex).toHaveBeenCalledWith(
      `anon:${SESSION_TOKEN}:session`,
      172800,
      expect.stringContaining('"validation_status":"gf_blocked"'),
    );
  });

  // Test 5: KAT OK + GF unavailable → gfStatus: 'unavailable', proceed allowed
  it('KAT OK + GF unavailable → gfStatus unavailable, canProceedToQuote: true', async () => {
    mockKatAdapter.validateVin.mockResolvedValue({
      available: true,
      status: 'ok',
    });
    mockGfAdapter.checkVehicle.mockRejectedValue(new GfApiUnavailableError());

    const result = await service.validateVehicle(validDto(), SESSION_TOKEN);

    expect(result.gfStatus).toBe('unavailable');
    expect(result.canProceedToQuote).toBe(true);
  });

  // Test 6: GF cache hit (Redis) → GF API NOT called
  it('GF cache hit → GF API not called (handled in adapter, service gets clean result)', async () => {
    mockKatAdapter.validateVin.mockResolvedValue({
      available: true,
      status: 'ok',
    });
    // Cache hit is handled in the adapter — here we just verify clean result works
    mockGfAdapter.checkVehicle.mockResolvedValue({
      flagged: false,
      source: 'cache',
    });

    const result = await service.validateVehicle(validDto(), SESSION_TOKEN);

    expect(result.gfStatus).toBe('clean');
    expect(mockGfAdapter.checkVehicle).toHaveBeenCalledTimes(1);
  });

  // Test 7: Session token expired (Redis miss) → validation completes without session update
  it('Session expired (Redis miss) → validation completes without crash', async () => {
    mockKatAdapter.validateVin.mockResolvedValue({
      available: true,
      status: 'ok',
    });
    mockGfAdapter.checkVehicle.mockResolvedValue({
      flagged: false,
      source: 'api',
    });
    mockRedis.get.mockResolvedValue(null); // session expired

    const result = await service.validateVehicle(validDto(), SESSION_TOKEN);

    expect(result.canProceedToQuote).toBe(true);
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  // Test 8: KAT stolen status → katStatus: 'failed', gfStatus: 'unavailable', canProceedToQuote: false
  it('KAT stolen → katStatus: failed, gfStatus: unavailable, canProceedToQuote: false', async () => {
    mockKatAdapter.validateVin.mockResolvedValue({
      available: true,
      status: 'stolen',
    });

    const result = await service.validateVehicle(validDto(), SESSION_TOKEN);

    expect(result.katStatus).toBe('failed');
    expect(result.gfStatus).toBe('unavailable');
    expect(result.canProceedToQuote).toBe(false);
    expect(mockGfAdapter.checkVehicle).not.toHaveBeenCalled();
  });
});
