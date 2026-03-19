import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { default as request } from 'supertest';
import { ThrottlerModule } from '@nestjs/throttler';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleBlockedByGfException } from './exceptions/vehicle-blocked-by-gf.exception';
import { VehicleValidationResultDto } from './dto/vehicle-validation-result.dto';
import { UnprocessableEntityException } from '@nestjs/common';

const VALID_VIN = 'WVWZZZ3BZ3E123456';
const SESSION_TOKEN = 'test-session-abc';

const mockVehiclesService = {
  validateVehicle: jest.fn(),
};

const successResult: VehicleValidationResultDto = {
  canProceedToQuote: true,
  katStatus: 'ok',
  gfStatus: 'clean',
  vinValid: true,
  validatedAt: new Date().toISOString(),
};

describe('VehiclesController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [VehiclesController],
      providers: [{ provide: VehiclesService, useValue: mockVehiclesService }],
    }).compile();

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
