/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { FleetBulkService } from './fleet-bulk.service';
import { FleetPdfExportService } from './fleet-pdf-export.service';
import { FleetDriverService } from './fleet-driver.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { Reflector } from '@nestjs/core';
import { FleetVehicleResponseDto } from './dto/fleet-vehicle-response.dto';
import { FleetPdfExportStatus } from './entities/fleet-pdf-export.entity';

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

const mockDriver = {
  userId: 'user-uuid-4',
  tenantId: TENANT_ID,
  role: 'driver',
  jti: 'jti-004',
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

const mockFleetBulkService = {
  bulkGetQuotes: jest.fn().mockResolvedValue({ results: [] }),
  bulkPurchase: jest.fn().mockResolvedValue({
    succeeded: [],
    failed: [],
    summary: { total: 0, succeeded: 0, failed: 0 },
  }),
};

const mockFleetDriverService = {
  getDriverView: jest.fn().mockResolvedValue([
    {
      vehicleId: 'v-id-1',
      licensePlate: 'КА0001ФЛ',
      make: 'BMW',
      model: 'X5',
      insurerName: 'Allianz Bulgaria',
      policyExpiresAt: new Date('2026-06-01'),
      policyStatus: 'active',
    },
  ]),
  assignDriver: jest.fn().mockResolvedValue(undefined),
};

const mockFleetPdfExportService = {
  createBatchExport: jest.fn().mockResolvedValue({
    exportId: 'export-uuid-001',
    status: FleetPdfExportStatus.PROCESSING,
    totalCount: 2,
    completedCount: 0,
    failedCount: 0,
    failedPolicyIds: [],
    zipS3Key: null,
    expiresAt: null,
  }),
  getExportStatus: jest.fn().mockResolvedValue({
    exportId: 'export-uuid-001',
    status: FleetPdfExportStatus.PROCESSING,
    totalCount: 2,
    completedCount: 1,
    failedCount: 0,
    failedPolicyIds: [],
    zipS3Key: null,
    expiresAt: null,
  }),
  getDownloadUrl: jest.fn().mockResolvedValue({
    downloadUrl: 'https://presigned-url',
    expiresInSeconds: 900,
  }),
};

type MockUser = typeof mockFleetAdmin | typeof mockDriver | null;

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
      { provide: FleetBulkService, useValue: mockFleetBulkService },
      { provide: FleetPdfExportService, useValue: mockFleetPdfExportService },
      { provide: FleetDriverService, useValue: mockFleetDriverService },
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

async function buildDriverApp(
  user: MockUser,
  featureEnabled = true,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [FleetController],
    providers: [
      { provide: FleetService, useValue: mockFleetService },
      { provide: FleetBulkService, useValue: mockFleetBulkService },
      { provide: FleetPdfExportService, useValue: mockFleetPdfExportService },
      { provide: FleetDriverService, useValue: mockFleetDriverService },
      { provide: Reflector, useClass: Reflector },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(makeJwtGuard(user))
    .overrideGuard(RolesGuard)
    .useValue(new RolesGuard(new Reflector()))
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

  // ─── GET /fleet/vehicles ───────────────────────────────────────────────────

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
        { provide: FleetBulkService, useValue: mockFleetBulkService },
        { provide: FleetPdfExportService, useValue: mockFleetPdfExportService },
        { provide: FleetDriverService, useValue: mockFleetDriverService },
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

  // ─── POST /fleet/bulk-quotes ───────────────────────────────────────────────

  it('POST /fleet/bulk-quotes → 404 when feature flag is disabled', async () => {
    const app = await buildApp(mockFleetAdmin, false);
    await request(app.getHttpServer())
      .post('/fleet/bulk-quotes')
      .send({ vehicleIds: ['00000000-0000-4000-8000-000000000001'] })
      .expect(404);
    await app.close();
  });

  it('POST /fleet/bulk-quotes → 400 when vehicleIds is empty', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .post('/fleet/bulk-quotes')
      .send({ vehicleIds: [] })
      .expect(400);
    await app.close();
  });

  it('POST /fleet/bulk-quotes → 400 when vehicleIds contains invalid UUID', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .post('/fleet/bulk-quotes')
      .send({ vehicleIds: ['not-a-uuid'] })
      .expect(400);
    await app.close();
  });

  it('POST /fleet/bulk-quotes → 200 with fleet_admin + feature enabled', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .post('/fleet/bulk-quotes')
      .send({ vehicleIds: ['00000000-0000-4000-8000-000000000001'] })
      .expect(200);

    expect(mockFleetBulkService.bulkGetQuotes).toHaveBeenCalledWith([
      '00000000-0000-4000-8000-000000000001',
    ]);
    await app.close();
  });

  it('POST /fleet/bulk-quotes → 200 with broker_admin + feature enabled', async () => {
    const app = await buildApp(mockBrokerAdmin, true);
    await request(app.getHttpServer())
      .post('/fleet/bulk-quotes')
      .send({ vehicleIds: ['00000000-0000-4000-8000-000000000001'] })
      .expect(200);
    await app.close();
  });

  // ─── POST /fleet/bulk-purchase ─────────────────────────────────────────────

  it('POST /fleet/bulk-purchase → 404 when feature flag is disabled', async () => {
    const app = await buildApp(mockFleetAdmin, false);
    await request(app.getHttpServer())
      .post('/fleet/bulk-purchase')
      .send({
        items: [
          {
            vehicleId: '00000000-0000-4000-8000-000000000001',
            quoteId: '00000000-0000-4000-8000-000000000002',
          },
        ],
      })
      .expect(404);
    await app.close();
  });

  it('POST /fleet/bulk-purchase → 400 when items is empty', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .post('/fleet/bulk-purchase')
      .send({ items: [] })
      .expect(400);
    await app.close();
  });

  it('POST /fleet/bulk-purchase → 400 when item has invalid UUID', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .post('/fleet/bulk-purchase')
      .send({
        items: [{ vehicleId: 'not-a-uuid', quoteId: 'also-not-a-uuid' }],
      })
      .expect(400);
    await app.close();
  });

  it('POST /fleet/bulk-purchase → 200 with fleet_admin + feature enabled', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    const res = await request(app.getHttpServer())
      .post('/fleet/bulk-purchase')
      .send({
        items: [
          {
            vehicleId: '00000000-0000-4000-8000-000000000001',
            quoteId: '00000000-0000-4000-8000-000000000002',
          },
        ],
      })
      .expect(200);

    const body = res.body as { summary: { total: number } };
    expect(body.summary).toBeDefined();
    await app.close();
  });

  // ─── POST /fleet/exports ────────────────────────────────────────────────────

  it('POST /fleet/exports → 404 when fleet feature flag is disabled', async () => {
    const app = await buildApp(mockFleetAdmin, false);
    await request(app.getHttpServer())
      .post('/fleet/exports')
      .send({ policyIds: ['00000000-0000-4000-8000-000000000001'] })
      .expect(404);
    await app.close();
  });

  it('POST /fleet/exports → 400 when policyIds contains invalid UUIDs', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .post('/fleet/exports')
      .send({ policyIds: ['not-a-uuid'] })
      .expect(400);
    await app.close();
  });

  it('POST /fleet/exports → 201 with fleet_admin role and feature enabled', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    const res = await request(app.getHttpServer())
      .post('/fleet/exports')
      .send({
        policyIds: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
        ],
      })
      .expect(201);

    const body = res.body as { exportId: string; status: string };
    expect(body.exportId).toBe('export-uuid-001');
    expect(body.status).toBe(FleetPdfExportStatus.PROCESSING);
    await app.close();
  });

  // ─── GET /fleet/exports/:id ─────────────────────────────────────────────────

  it('GET /fleet/exports/:id → 400 when export belongs to different tenant', async () => {
    mockFleetPdfExportService.getExportStatus.mockRejectedValueOnce(
      new BadRequestException('Export not found'),
    );
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .get('/fleet/exports/00000000-0000-4000-8000-000000000001')
      .expect(400);
    await app.close();
  });

  // ─── GET /fleet/exports/:id/download ────────────────────────────────────────

  it('GET /fleet/exports/:id/download → 410 when export has expired', async () => {
    mockFleetPdfExportService.getDownloadUrl.mockRejectedValueOnce(
      new HttpException(
        'Export has expired. Please generate a new batch export.',
        HttpStatus.GONE,
      ),
    );
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .get('/fleet/exports/00000000-0000-4000-8000-000000000001/download')
      .expect(410);
    await app.close();
  });

  // ─── GET /fleet/driver/vehicles ──────────────────────────────────────────────

  it('GET /fleet/driver/vehicles → 200 for driver role', async () => {
    const app = await buildDriverApp(mockDriver, true);
    const res = await request(app.getHttpServer())
      .get('/fleet/driver/vehicles')
      .expect(200);

    const body = res.body as Array<{
      licensePlate: string;
      policyStatus: string;
    }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].licensePlate).toBe('КА0001ФЛ');
    expect(body[0].policyStatus).toBe('active');
    await app.close();
  });

  it('GET /fleet/driver/vehicles → 403 for fleet_admin role', async () => {
    const app = await buildDriverApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .get('/fleet/driver/vehicles')
      .expect(403);
    await app.close();
  });

  it('GET /fleet/driver/vehicles → 403 for broker_admin role', async () => {
    const app = await buildDriverApp(mockBrokerAdmin, true);
    await request(app.getHttpServer())
      .get('/fleet/driver/vehicles')
      .expect(403);
    await app.close();
  });

  it('GET /fleet/driver/vehicles → 401 when not authenticated', async () => {
    const app = await buildDriverApp(null, true);
    await request(app.getHttpServer())
      .get('/fleet/driver/vehicles')
      .expect(401);
    await app.close();
  });

  // ─── PUT /fleet/vehicles/:vehicleId/driver ───────────────────────────────────

  it('PUT /fleet/vehicles/:vehicleId/driver → 200 for fleet_admin', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .put('/fleet/vehicles/00000000-0000-4000-8000-000000000001/driver')
      .send({ driverUserId: '00000000-0000-4000-8000-000000000002' })
      .expect(200);
    await app.close();
  });

  it('PUT /fleet/vehicles/:vehicleId/driver → 200 when unassigning driver (driverUserId null)', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .put('/fleet/vehicles/00000000-0000-4000-8000-000000000001/driver')
      .send({ driverUserId: null })
      .expect(200);
    await app.close();
  });

  it('PUT /fleet/vehicles/:vehicleId/driver → 400 when driverUserId is invalid UUID', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .put('/fleet/vehicles/00000000-0000-4000-8000-000000000001/driver')
      .send({ driverUserId: 'not-a-uuid' })
      .expect(400);
    await app.close();
  });

  it('PUT /fleet/vehicles/:vehicleId/driver → 400 when driverUserId is missing from body', async () => {
    const app = await buildApp(mockFleetAdmin, true);
    await request(app.getHttpServer())
      .put('/fleet/vehicles/00000000-0000-4000-8000-000000000001/driver')
      .send({})
      .expect(400);
    await app.close();
  });

  it('PUT /fleet/vehicles/:vehicleId/driver → 403 for driver role', async () => {
    const app = await buildDriverApp(mockDriver, true);
    await request(app.getHttpServer())
      .put('/fleet/vehicles/00000000-0000-4000-8000-000000000001/driver')
      .send({ driverUserId: '00000000-0000-4000-8000-000000000002' })
      .expect(403);
    await app.close();
  });

  it('PUT /fleet/vehicles/:vehicleId/driver → 401 when not authenticated', async () => {
    const app = await buildDriverApp(null, true);
    await request(app.getHttpServer())
      .put('/fleet/vehicles/00000000-0000-4000-8000-000000000001/driver')
      .send({ driverUserId: '00000000-0000-4000-8000-000000000002' })
      .expect(401);
    await app.close();
  });
});
