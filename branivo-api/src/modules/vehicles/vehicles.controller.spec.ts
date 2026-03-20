import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  NotFoundException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { default as request } from 'supertest';
import { ThrottlerModule } from '@nestjs/throttler';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleBlockedByGfException } from './exceptions/vehicle-blocked-by-gf.exception';
import { VehicleValidationResultDto } from './dto/vehicle-validation-result.dto';
import { VehicleResponseDto } from './dto/vehicle-response.dto';
import { ClientJwtAuthGuard } from '../clients/guards/client-jwt-auth.guard';

const VALID_VIN = 'WVWZZZ3BZ3E123456';
const SESSION_TOKEN = 'test-session-abc';
const OWNER_ID = 'owner-uuid-123';
const VEHICLE_ID = 'vehicle-uuid-456';

const mockVehiclesService = {
  validateVehicle: jest.fn(),
  saveVehicle: jest.fn(),
  listVehicles: jest.fn(),
  getVehicle: jest.fn(),
};

const successResult: VehicleValidationResultDto = {
  canProceedToQuote: true,
  katStatus: 'ok',
  gfStatus: 'clean',
  vinValid: true,
  validatedAt: new Date().toISOString(),
};

const mockVehicleResponse: VehicleResponseDto = {
  id: VEHICLE_ID,
  tenantId: 'tenant-uuid',
  ownerId: OWNER_ID,
  vin: VALID_VIN,
  licensePlate: 'СА1234АА',
  make: 'VW',
  model: 'Golf',
  year: 2020,
  color: null,
  engineVolume: null,
  fuelType: null,
  firstRegistrationDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastPolicyStatus: null,
};

// Guard that always allows access and sets mock user
class MockClientJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user: unknown }>();
    req.user = {
      userId: OWNER_ID,
      tenantId: 'tenant-uuid',
      role: 'end_client',
      jti: 'jti',
      exp: 9999999999,
    };
    return true;
  }
}

// Guard that always rejects
class RejectingGuard implements CanActivate {
  canActivate(): boolean {
    return false;
  }
}

describe('VehiclesController — validate (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [VehiclesController],
      providers: [{ provide: VehiclesService, useValue: mockVehiclesService }],
    })
      .overrideGuard(ClientJwtAuthGuard)
      .useClass(MockClientJwtAuthGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 1: 200 — valid VIN, KAT OK, GF clean
  it('POST /vehicles/validate 200 — valid VIN, KAT OK, GF clean', async () => {
    mockVehiclesService.validateVehicle.mockResolvedValue(successResult);

    const res = await request(app.getHttpServer())
      .post('/vehicles/validate')
      .set('x-session-token', SESSION_TOKEN)
      .send({ vin: VALID_VIN, licensePlate: 'СА1234АА' });

    expect(res.status).toBe(200);
    const body = res.body as VehicleValidationResultDto;
    expect(body.canProceedToQuote).toBe(true);
    expect(body.katStatus).toBe('ok');
  });

  // Test 2: 422 — invalid VIN format (service throws UnprocessableEntityException)
  it('POST /vehicles/validate 422 — invalid VIN format from service', async () => {
    mockVehiclesService.validateVehicle.mockRejectedValue(
      new UnprocessableEntityException({
        statusCode: 422,
        message: 'VIN невалиден формат',
        error: 'Unprocessable Entity',
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/vehicles/validate')
      .set('x-session-token', SESSION_TOKEN)
      .send({ vin: VALID_VIN, licensePlate: 'СА1234АА' });

    expect(res.status).toBe(422);
  });

  // Test 3: 403 — GF blocked
  it('POST /vehicles/validate 403 — GF blocked', async () => {
    mockVehiclesService.validateVehicle.mockRejectedValue(
      new VehicleBlockedByGfException(),
    );

    const res = await request(app.getHttpServer())
      .post('/vehicles/validate')
      .set('x-session-token', SESSION_TOKEN)
      .send({ vin: VALID_VIN, licensePlate: 'СА1234АА' });

    expect(res.status).toBe(403);
    const body = res.body as { code: string };
    expect(body.code).toBe('GF_BLOCKED');
  });

  // Test 4: 200 — KAT unavailable, manual fallback
  it('POST /vehicles/validate 200 — KAT unavailable (manual fallback)', async () => {
    const fallbackResult: VehicleValidationResultDto = {
      ...successResult,
      katStatus: 'manual_fallback',
    };
    mockVehiclesService.validateVehicle.mockResolvedValue(fallbackResult);

    const res = await request(app.getHttpServer())
      .post('/vehicles/validate')
      .set('x-session-token', SESSION_TOKEN)
      .send({ vin: VALID_VIN, licensePlate: 'СА1234АА' });

    expect(res.status).toBe(200);
    const body = res.body as VehicleValidationResultDto;
    expect(body.katStatus).toBe('manual_fallback');
  });

  // Test 5: missing X-Session-Token → proceeds without session update (not 400)
  it('POST /vehicles/validate — missing X-Session-Token → 200 (no error)', async () => {
    mockVehiclesService.validateVehicle.mockResolvedValue(successResult);

    const res = await request(app.getHttpServer())
      .post('/vehicles/validate')
      .send({ vin: VALID_VIN, licensePlate: 'СА1234АА' });

    expect(res.status).toBe(200);
    expect(mockVehiclesService.validateVehicle).toHaveBeenCalledWith(
      expect.objectContaining({ vin: VALID_VIN }),
      '',
    );
  });
});

describe('VehiclesController — CRUD (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [VehiclesController],
      providers: [{ provide: VehiclesService, useValue: mockVehiclesService }],
    })
      .overrideGuard(ClientJwtAuthGuard)
      .useClass(MockClientJwtAuthGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 1: POST 201 — create vehicle
  it('POST /vehicles 201 — saves vehicle successfully', async () => {
    mockVehiclesService.saveVehicle.mockResolvedValue(mockVehicleResponse);

    const res = await request(app.getHttpServer()).post('/vehicles').send({
      vin: VALID_VIN,
      licensePlate: 'СА1234АА',
      make: 'VW',
      model: 'Golf',
      year: 2020,
    });

    expect(res.status).toBe(201);
    const body = res.body as VehicleResponseDto;
    expect(body.id).toBe(VEHICLE_ID);
    expect(mockVehiclesService.saveVehicle).toHaveBeenCalledWith(
      expect.objectContaining({ vin: VALID_VIN }),
      OWNER_ID,
      'tenant-uuid',
    );
  });

  // Test 2: GET /vehicles 200 — list with vehicles
  it('GET /vehicles 200 — returns list of vehicles', async () => {
    mockVehiclesService.listVehicles.mockResolvedValue([mockVehicleResponse]);

    const res = await request(app.getHttpServer()).get('/vehicles');

    expect(res.status).toBe(200);
    const body = res.body as VehicleResponseDto[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].vin).toBe(VALID_VIN);
  });

  // Test 3: GET /vehicles 200 — empty list
  it('GET /vehicles 200 — returns empty list', async () => {
    mockVehiclesService.listVehicles.mockResolvedValue([]);

    const res = await request(app.getHttpServer()).get('/vehicles');

    expect(res.status).toBe(200);
    const body = res.body as VehicleResponseDto[];
    expect(body).toEqual([]);
  });

  // Test 4: GET /vehicles/:id 200 — found
  it('GET /vehicles/:id 200 — returns single vehicle', async () => {
    mockVehiclesService.getVehicle.mockResolvedValue(mockVehicleResponse);

    const res = await request(app.getHttpServer()).get(
      `/vehicles/${VEHICLE_ID}`,
    );

    expect(res.status).toBe(200);
    const body = res.body as VehicleResponseDto;
    expect(body.id).toBe(VEHICLE_ID);
  });

  // Test 5: GET /vehicles/:id 404 — not found
  it('GET /vehicles/:id 404 — not found', async () => {
    mockVehiclesService.getVehicle.mockRejectedValue(
      new NotFoundException('МПС не е намерено'),
    );

    const res = await request(app.getHttpServer()).get(
      `/vehicles/non-existent-id`,
    );

    expect(res.status).toBe(404);
  });
});

describe('VehiclesController — CRUD unauthorized', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [VehiclesController],
      providers: [{ provide: VehiclesService, useValue: mockVehiclesService }],
    })
      .overrideGuard(ClientJwtAuthGuard)
      .useClass(RejectingGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /vehicles 403 — guard rejects (no valid JWT)', async () => {
    const res = await request(app.getHttpServer()).get('/vehicles');
    expect(res.status).toBe(403);
  });
});
