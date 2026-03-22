import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { AdminHealthController } from './admin-health.controller';
import { AdminHealthService } from './admin-health.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { TenantHealthSummaryResponseDto } from './dto/tenant-health-summary-response.dto';
import { TenantHealthDetailResponseDto } from './dto/tenant-health-detail-response.dto';

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockSummary: TenantHealthSummaryResponseDto = {
  tenantId: VALID_UUID,
  tenantName: 'Demo Broker',
  slug: 'demo',
  status: 'active',
  subscriptionTier: 'starter',
  policiesLast30Days: 5,
  lastActivityAt: '2026-03-20T10:00:00.000Z',
  inactiveDays: 2,
};

const mockDetail: TenantHealthDetailResponseDto = {
  tenantId: VALID_UUID,
  tenantName: 'Demo Broker',
  activeUsersCount: 3,
  totalRevenueBgn: 1500,
  vehicleCount: 10,
  lastPolicyCreatedAt: '2026-03-20T10:00:00.000Z',
  lastPolicyInsurer: 'Bulins',
  activeFeatureFlags: ['fleet', 'custom_domain'],
};

const mockAdminHealthService = {
  getPlatformHealthDashboard: jest.fn().mockResolvedValue([mockSummary]),
  getTenantHealthDetail: jest.fn().mockResolvedValue(mockDetail),
};

const superAdminUser = { userId: 'super-uuid', role: 'super_admin' };
const brokerAdminUser = { userId: 'broker-uuid', role: 'broker_admin' };

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
    controllers: [AdminHealthController],
    providers: [
      { provide: AdminHealthService, useValue: mockAdminHealthService },
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

describe('AdminHealthController', () => {
  let superAdminApp: INestApplication;
  let brokerApp: INestApplication;
  let unauthApp: INestApplication;

  beforeAll(async () => {
    superAdminApp = await buildApp(superAdminUser);
    brokerApp = await buildApp(brokerAdminUser);
    unauthApp = await buildApp(null);
  });

  afterAll(async () => {
    await superAdminApp.close();
    await brokerApp.close();
    await unauthApp.close();
  });

  beforeEach(() => jest.clearAllMocks());

  describe('GET /admin/health', () => {
    it('returns 200 with platform health for super_admin', async () => {
      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get('/admin/health')
        .expect(200);

      const body = res.body as TenantHealthSummaryResponseDto[];
      expect(body).toHaveLength(1);
      expect(body[0].tenantId).toBe(VALID_UUID);
      expect(body[0].policiesLast30Days).toBe(5);
    });

    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .get('/admin/health')
        .expect(401);
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .get('/admin/health')
        .expect(403);
    });

    it('response does not contain sensitive api_key_enc', async () => {
      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get('/admin/health')
        .expect(200);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain('api_key_enc');
    });
  });

  describe('GET /admin/health/:tenantId', () => {
    it('returns 200 with tenant detail for super_admin', async () => {
      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get(`/admin/health/${VALID_UUID}`)
        .expect(200);

      const body = res.body as TenantHealthDetailResponseDto;
      expect(body.tenantId).toBe(VALID_UUID);
      expect(body.activeUsersCount).toBe(3);
      expect(body.activeFeatureFlags).toEqual(['fleet', 'custom_domain']);
    });

    it('returns 400 for invalid UUID param', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .get('/admin/health/not-a-uuid')
        .expect(400);
    });

    it('returns 404 when tenant not found', async () => {
      mockAdminHealthService.getTenantHealthDetail.mockRejectedValueOnce(
        new NotFoundException('Tenant not found'),
      );

      await request(superAdminApp.getHttpServer() as import('http').Server)
        .get(`/admin/health/${VALID_UUID}`)
        .expect(404);
    });

    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .get(`/admin/health/${VALID_UUID}`)
        .expect(401);
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .get(`/admin/health/${VALID_UUID}`)
        .expect(403);
    });
  });
});
