/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { Reflector } from '@nestjs/core';
import { FleetVehicleResponseDto } from './dto/fleet-vehicle-response.dto';

const TENANT_ID = 'tenant-uuid-001';

const mockFleetAdmin = {
  userId: 'user-uuid-1',
  tenantId: TENANT_ID,
  role: 'fleet_admin',
  jti: 'jti-001',
  exp: Math.floor(Date.now() / 1000) + 900,
};

const mockBrokerAdmin = {
  userId: 'user-uuid-2',
  tenantId: TENANT_ID,
  role: 'broker_admin',
  jti: 'jti-002',
  exp: Math.floor(Date.now() / 1000) + 900,
};

const mockBrokerAgent = {
  userId: 'user-uuid-3',
  tenantId: TENANT_ID,
  role: 'broker_agent',
  jti: 'jti-003',
  exp: Math.floor(Date.now() / 1000) + 900,
};

const mockVehicle: FleetVehicleResponseDto = {
  id: 'fv-id-1',
  vehicleId: 'v-id-1',
  licensePlate: 'СА1234АВ',
  make: 'Toyota',
  model: 'Corolla',
  insurerName: 'ДЗИ',
  policyExpiresAt: new Date('2026-06-01'),
  status: 'green',
};

const mockYellowVehicle: FleetVehicleResponseDto = {
  id: 'fv-id-2',
  vehicleId: 'v-id-2',
  licensePlate: 'СА5678ВГ',
  make: 'VW',
  model: 'Golf',
  insurerName: 'Allianz',
  policyExpiresAt: new Date('2026-04-01'),
  status: 'yellow',
};

const mockFleetService = {
  getFleetVehicles: jest.fn().mockResolvedValue({
    data: [mockVehicle],
    meta: { total: 1, page: 1, limit: 20, timestamp: new Date().toISOString() },
  }),
};

type MockUser = typeof mockFleetAdmin | null;

function makeJwtGuard(user: MockUser) {
  return {
    canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
      if (!user) {
        throw new (jest.requireActual<typeof import('@nestjs/common')>(
          '@nestjs/common',
        ).UnauthorizedException)();
      }
      const req = ctx.switchToHttp().getRequest<{ user: MockUser }>();
      req.user = user;
      return true;
    },
  };
}

function makeFeatureFlagGuard(featureEnabled: boolean) {
  return {
    canActivate: () => {
      if (!featureEnabled) throw new NotFoundException();
      return true;
    },
  };
}

async function buildApp(
  user: MockUser,
  featureEnabled = true,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [FleetController],
    providers: [
      { provide: FleetService, useValue: mockFleetService },
      { provide: Reflector, useClass: Reflector },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(makeJwtGuard(user))
    .overrideGuard(RolesGuard)
    .useValue({
      canActivate: () => {
        if (!user) return false;
        const allowedRoles = ['fleet_admin', 'broker_admin'];
        return allowedRoles.includes(user.role);
      },
    })
    .overrideGuard(FeatureFlagGuard)
    .useValue(makeFeatureFlagGuard(featureEnabled))
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  await app.init();
  return app;
}

describe('FleetController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /fleet/vehicles → 404 when feature flag is disabled', async () => {
    const app = await buildApp(mockFleetAdmin, false);
    await request(app.getHttpServer()).get('/fleet/vehicles').expect(404);
    await app.close();
  });

  it('GET /fleet/vehicles → 401 when not authenticated', async () => {
    const app = await buildApp(null);
    await request(app.getHttpServer()).get('/fleet/vehicles').expect(401);
    await app.close();
  });

  it('GET /fleet/vehicles → 403 when role is broker_agent', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FleetController],
      providers: [
        { provide: FleetService, useValue: mockFleetService },
        { provide: Reflector, useClass: Reflector },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(makeJwtGuard(mockBrokerAgent))
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: () => {
          const err = new (jest.requireActual<typeof import('@nestjs/common')>(
            '@nestjs/common',
          ).ForbiddenException)();
          throw err;
        },
      })
      .overrideGuard(FeatureFlagGuard)
      .useValue(makeFeatureFlagGuard(true))
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).get('/fleet/vehicles').expect(403);
    await app.close();
  });

  it('GET /fleet/vehicles → 200 with fleet_admin + feature enabled', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    const res = await request(app.getHttpServer())
      .get('/fleet/vehicles')
      .expect(200);

    const body = res.body as {
      data: FleetVehicleResponseDto[];
      meta: { total: number };
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].status).toBe('green');
    expect(body.meta.total).toBe(1);
    await app.close();
  });

  it('GET /fleet/vehicles → 200 with broker_admin + feature enabled', async () => {
    const app = await buildApp(mockBrokerAdmin, true);
    await request(app.getHttpServer()).get('/fleet/vehicles').expect(200);
    await app.close();
  });

  it('GET /fleet/vehicles?status=yellow → filters by status', async () => {
    mockFleetService.getFleetVehicles.mockResolvedValueOnce({
      data: [mockYellowVehicle],
      meta: {
        total: 1,
        page: 1,
        limit: 20,
        timestamp: new Date().toISOString(),
      },
    });

    const app = await buildApp(mockFleetAdmin, true);
    const res = await request(app.getHttpServer())
      .get('/fleet/vehicles?status=yellow')
      .expect(200);

    const body = res.body as { data: FleetVehicleResponseDto[] };
    expect(body.data[0].status).toBe('yellow');
    expect(mockFleetService.getFleetVehicles).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'yellow' }),
    );
    await app.close();
  });

  it('GET /fleet/vehicles?page=2&limit=10 → passes pagination to service', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .get('/fleet/vehicles?page=2&limit=10')
      .expect(200);

    expect(mockFleetService.getFleetVehicles).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 10 }),
    );
    await app.close();
  });
});
