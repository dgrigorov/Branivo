import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import {
  BrokerCommissionsController,
  CommissionsController,
} from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { Reflector } from '@nestjs/core';
import { ProductType } from './enums/product-type.enum';
import { CommissionMatrixEntryDto } from './dto/commission-matrix-response.dto';
import type { CommissionDashboardResponseDto } from './dto/commission-dashboard.dto';

const mockCommissionsService = {
  listMatrix: jest.fn(),
  upsertRate: jest.fn(),
  getDashboardStats: jest.fn(),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue('tenant-uuid'),
};

const INSURER_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockEntry: CommissionMatrixEntryDto = {
  insurerId: INSURER_UUID,
  insurerName: 'Allianz Bulgaria',
  productType: ProductType.GO,
  ratePct: 0.05,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockDashboard: CommissionDashboardResponseDto = {
  summary: {
    totalPolicies: 2,
    totalPremium: 770,
    totalCommission: 36.9,
    currency: 'BGN',
  },
  byInsurer: [
    {
      insurerId: INSURER_UUID,
      insurerName: 'Allianz Bulgaria',
      policiesCount: 2,
      totalPremium: 770,
      totalCommission: 36.9,
    },
  ],
  policies: [
    {
      id: 'pol-1',
      insurerId: INSURER_UUID,
      insurerName: 'Allianz Bulgaria',
      productType: 'GO',
      premiumAmount: 450,
      commissionPct: 0.05,
      commissionAmount: 22.5,
      commissionStatus: 'confirmed',
      createdAt: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'pce-1',
      insurerId: INSURER_UUID,
      insurerName: 'Allianz Bulgaria',
      productType: 'GO',
      premiumAmount: 320,
      commissionPct: 0.045,
      commissionAmount: 14.4,
      commissionStatus: 'pending',
      createdAt: '2026-03-15T12:00:00.000Z',
    },
  ],
};

const superAdminUser = { userId: 'super-uuid', role: 'super_admin' };
const brokerAdminUser = { userId: 'broker-uuid', role: 'broker_admin' };
const brokerAgentUser = { userId: 'agent-uuid', role: 'broker_agent' };
const brokerViewerUser = { userId: 'viewer-uuid', role: 'broker_viewer' };

function makeAuthGuard(user: typeof superAdminUser | null) {
  return {
    canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
      if (!user) throw new UnauthorizedException();
      const req = ctx.switchToHttp().getRequest<{ user: typeof user }>();
      req.user = user;
      return true;
    },
  };
}

async function buildApp(
  user: typeof superAdminUser | null,
): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [CommissionsController, BrokerCommissionsController],
    providers: [
      { provide: CommissionsService, useValue: mockCommissionsService },
      { provide: TenantContext, useValue: mockTenantContext },
      Reflector,
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(makeAuthGuard(user))
    .overrideGuard(RolesGuard)
    .useValue({
      canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
        if (!user) return false;
        const roles = new Reflector().getAllAndOverride<string[]>('roles', [
          ctx.getHandler(),
          ctx.getClass(),
        ]);
        if (!roles) return true;
        return roles.includes(user.role);
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return app;
}

describe('CommissionsController', () => {
  let superAdminApp: INestApplication;
  let brokerAdminApp: INestApplication;
  let brokerAgentApp: INestApplication;
  let brokerViewerApp: INestApplication;
  let unauthApp: INestApplication;

  beforeAll(async () => {
    superAdminApp = await buildApp(superAdminUser);
    brokerAdminApp = await buildApp(brokerAdminUser);
    brokerAgentApp = await buildApp(brokerAgentUser);
    brokerViewerApp = await buildApp(brokerViewerUser);
    unauthApp = await buildApp(null);
  });

  afterAll(async () => {
    await superAdminApp.close();
    await brokerAdminApp.close();
    await brokerAgentApp.close();
    await brokerViewerApp.close();
    await unauthApp.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommissionsService.listMatrix.mockResolvedValue([mockEntry]);
    mockCommissionsService.upsertRate.mockResolvedValue(mockEntry);
    mockCommissionsService.getDashboardStats.mockResolvedValue(mockDashboard);
    mockTenantContext.getTenantId.mockReturnValue('tenant-uuid');
  });

  describe('GET /admin/commissions', () => {
    it('returns 200 with { data, meta } for super_admin', async () => {
      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get('/admin/commissions')
        .expect(200);

      const body = res.body as { data: CommissionMatrixEntryDto[] };
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data[0]).toMatchObject({
        insurerId: INSURER_UUID,
        productType: 'GO',
        ratePct: 0.05,
      });
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerAdminApp.getHttpServer() as import('http').Server)
        .get('/admin/commissions')
        .expect(403);
    });

    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .get('/admin/commissions')
        .expect(401);
    });
  });

  describe('PUT /admin/commissions/:insurerId/:productType', () => {
    it('returns 200 with updated entry for super_admin', async () => {
      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .put(`/admin/commissions/${INSURER_UUID}/GO`)
        .send({ productType: 'GO', ratePct: 0.06 })
        .expect(200);

      const body = res.body as { data: CommissionMatrixEntryDto };
      expect(body).toHaveProperty('data');
      expect(body.data.insurerId).toBe(INSURER_UUID);
      expect(mockCommissionsService.upsertRate).toHaveBeenCalledWith(
        INSURER_UUID,
        expect.objectContaining({ productType: 'GO', ratePct: 0.06 }),
        superAdminUser.userId,
      );
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerAdminApp.getHttpServer() as import('http').Server)
        .put(`/admin/commissions/${INSURER_UUID}/GO`)
        .send({ productType: 'GO', ratePct: 0.06 })
        .expect(403);
    });

    it('returns 400 for ratePct > 1', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .put(`/admin/commissions/${INSURER_UUID}/GO`)
        .send({ productType: 'GO', ratePct: 1.5 })
        .expect(400);
    });

    it('returns 400 for negative ratePct', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .put(`/admin/commissions/${INSURER_UUID}/GO`)
        .send({ productType: 'GO', ratePct: -0.01 })
        .expect(400);
    });

    it('returns 400 for invalid productType in URL param', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .put(`/admin/commissions/${INSURER_UUID}/INVALID_TYPE`)
        .send({ productType: 'GO', ratePct: 0.05 })
        .expect(400);
    });

    it('returns 400 for non-UUID insurerId in URL param', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .put('/admin/commissions/not-a-uuid/GO')
        .send({ productType: 'GO', ratePct: 0.05 })
        .expect(400);
    });
  });

  describe('GET /commissions (broker dashboard)', () => {
    it('returns 200 with dashboard data for broker_admin', async () => {
      const res = await request(
        brokerAdminApp.getHttpServer() as import('http').Server,
      )
        .get('/commissions')
        .expect(200);

      const body = res.body as { data: CommissionDashboardResponseDto };
      expect(body).toHaveProperty('data');
      expect(body.data.summary.totalPolicies).toBe(2);
      expect(body.data.summary.currency).toBe('BGN');
      expect(Array.isArray(body.data.policies)).toBe(true);
    });

    it('returns 200 for broker_agent role', async () => {
      await request(brokerAgentApp.getHttpServer() as import('http').Server)
        .get('/commissions')
        .expect(200);
    });

    it('returns 200 for broker_viewer role', async () => {
      await request(brokerViewerApp.getHttpServer() as import('http').Server)
        .get('/commissions')
        .expect(200);
    });

    it('uses TenantContext.getTenantId() for tenant scoping', async () => {
      await request(brokerAdminApp.getHttpServer() as import('http').Server)
        .get('/commissions')
        .expect(200);

      expect(mockTenantContext.getTenantId).toHaveBeenCalled();
      expect(mockCommissionsService.getDashboardStats).toHaveBeenCalledWith(
        'tenant-uuid',
        expect.objectContaining({}),
      );
    });

    it('returns 200 with dateFrom filter applied', async () => {
      await request(brokerAdminApp.getHttpServer() as import('http').Server)
        .get('/commissions?dateFrom=2026-01-01')
        .expect(200);

      expect(mockCommissionsService.getDashboardStats).toHaveBeenCalledWith(
        'tenant-uuid',
        expect.objectContaining({ dateFrom: '2026-01-01' }),
      );
    });

    it('returns 403 for super_admin role (wrong role for broker endpoint)', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .get('/commissions')
        .expect(403);
    });

    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .get('/commissions')
        .expect(401);
    });
  });
});
