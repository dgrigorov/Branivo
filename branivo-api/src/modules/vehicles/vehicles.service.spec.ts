import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { VehiclesService } from './vehicles.service';
import { KatApiAdapter } from './adapters/kat-api.adapter';
import { GarantsionenFondAdapter } from './adapters/garantsionen-fond.adapter';
import { KatApiUnavailableError } from './exceptions/kat-api-unavailable.exception';
import { GfApiUnavailableError } from './exceptions/gf-api-unavailable.exception';
import { VehicleBlockedByGfException } from './exceptions/vehicle-blocked-by-gf.exception';
import { ValidateVehicleDto } from './dto/validate-vehicle.dto';
import { VehiclesRepository } from './vehicles.repository';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { Vehicle } from './entities/vehicle.entity';
import { NotificationsService } from '../notifications/notifications.service';

const VALID_VIN = 'WVWZZZ3BZ3E123456';
const SESSION_TOKEN = 'test-session-token';
const LICENSE_PLATE = 'СА1234АА';
const OWNER_ID = 'owner-uuid-123';
const VEHICLE_ID = 'vehicle-uuid-456';

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

const mockVehiclesRepository = {
  save: jest.fn(),
  findByOwner: jest.fn(),
  findByOwnerAndId: jest.fn(),
};

const mockNotificationsService = {
  notifyBroker: jest.fn().mockResolvedValue(true),
};

function buildVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  const v = new Vehicle();
  v.id = VEHICLE_ID;
  v.tenantId = 'tenant-uuid';
  v.ownerId = OWNER_ID;
  v.vin = VALID_VIN;
  v.licensePlate = LICENSE_PLATE;
  v.make = 'VW';
  v.model = 'Golf';
  v.year = 2020;
  v.color = null;
  v.engineVolume = null;
  v.fuelType = null;
  v.firstRegistrationDate = null;
  v.createdAt = new Date();
  v.updatedAt = new Date();
  v.deletedAt = null;
  return Object.assign(v, overrides);
}

function buildService(): VehiclesService {
  return new VehiclesService(
    mockKatAdapter as unknown as KatApiAdapter,
    mockGfAdapter as unknown as GarantsionenFondAdapter,
    mockRedis as unknown as Redis,
    mockVehiclesRepository as unknown as VehiclesRepository,
    mockNotificationsService as unknown as NotificationsService,
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

function buildCreateDto(
  overrides: Partial<CreateVehicleDto> = {},
): CreateVehicleDto {
  return Object.assign(new CreateVehicleDto(), {
    vin: VALID_VIN,
    licensePlate: LICENSE_PLATE,
    make: 'VW',
    model: 'Golf',
    year: 2020,
    ...overrides,
  });
}

describe('VehiclesService — validateVehicle', () => {
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

  // Test 4: KAT OK + GF flagged → VehicleBlockedByGfException, session updated + broker notified
  it('KAT OK + GF flagged → VehicleBlockedByGfException, session gf_blocked + broker notified', async () => {
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
    // Allow broker notification promise to resolve
    await new Promise((r) => setImmediate(r));
    expect(mockNotificationsService.notifyBroker).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tid',
        subject: 'МПС с нередовен статус',
      }),
    );
  });

  // Test 4b: KAT OK + GF flagged + no session tenant_id → broker notification NOT sent
  it('KAT OK + GF flagged + no session → VehicleBlockedByGfException, broker NOT notified', async () => {
    mockKatAdapter.validateVin.mockResolvedValue({
      available: true,
      status: 'ok',
    });
    mockGfAdapter.checkVehicle.mockResolvedValue({
      flagged: true,
      source: 'api',
    });
    mockRedis.get.mockResolvedValue(null); // No session

    await expect(
      service.validateVehicle(validDto(), SESSION_TOKEN),
    ).rejects.toThrow(VehicleBlockedByGfException);

    await new Promise((r) => setImmediate(r));
    expect(mockNotificationsService.notifyBroker).not.toHaveBeenCalled();
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

describe('VehiclesService — saveVehicle', () => {
  let service: VehiclesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = buildService();
  });

  it('saveVehicle → saves and returns VehicleResponseDto', async () => {
    const saved = buildVehicle();
    mockVehiclesRepository.save.mockResolvedValue(saved);

    const dto = buildCreateDto({ color: 'Бяло' });
    const result = await service.saveVehicle(dto, OWNER_ID, 'tenant-uuid');

    expect(mockVehiclesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        vin: VALID_VIN,
        licensePlate: LICENSE_PLATE,
        make: 'VW',
        model: 'Golf',
        year: 2020,
        ownerId: OWNER_ID,
        tenantId: 'tenant-uuid',
        color: 'Бяло',
      }),
    );
    expect(result.id).toBe(VEHICLE_ID);
    expect(result.ownerId).toBe(OWNER_ID);
    expect(result.lastPolicyStatus).toBeNull();
  });
});

describe('VehiclesService — listVehicles', () => {
  let service: VehiclesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = buildService();
  });

  it('listVehicles — empty list → returns []', async () => {
    mockVehiclesRepository.findByOwner.mockResolvedValue([]);

    const result = await service.listVehicles(OWNER_ID);

    expect(result).toEqual([]);
    expect(mockVehiclesRepository.findByOwner).toHaveBeenCalledWith(OWNER_ID);
  });

  it('listVehicles — with vehicles → returns mapped DTOs', async () => {
    const vehicles = [buildVehicle(), buildVehicle({ id: 'other-id' })];
    mockVehiclesRepository.findByOwner.mockResolvedValue(vehicles);

    const result = await service.listVehicles(OWNER_ID);

    expect(result).toHaveLength(2);
    expect(result[0].vin).toBe(VALID_VIN);
    expect(result[0].lastPolicyStatus).toBeNull();
  });
});

describe('VehiclesService — getVehicle', () => {
  let service: VehiclesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = buildService();
  });

  it('getVehicle — found → returns VehicleResponseDto', async () => {
    const vehicle = buildVehicle();
    mockVehiclesRepository.findByOwnerAndId.mockResolvedValue(vehicle);

    const result = await service.getVehicle(OWNER_ID, VEHICLE_ID);

    expect(result.id).toBe(VEHICLE_ID);
    expect(mockVehiclesRepository.findByOwnerAndId).toHaveBeenCalledWith(
      OWNER_ID,
      VEHICLE_ID,
    );
  });

  it('getVehicle — not found → throws NotFoundException', async () => {
    mockVehiclesRepository.findByOwnerAndId.mockResolvedValue(null);

    await expect(service.getVehicle(OWNER_ID, VEHICLE_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
