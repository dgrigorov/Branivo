import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { AdminInsurerMonitorController } from './admin-insurer-monitor.controller';
import { AdminInsurerMonitorService } from './admin-insurer-monitor.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { InsurerApiStatusResponseDto } from './dto/insurer-api-status-response.dto';

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockDashboard: InsurerApiStatusResponseDto[] = [
  {
    insurerId: VALID_UUID,
    insurerName: 'Allianz',
    insurerCode: 'allianz',
    circuitState: 'closed',
    errorRate5min: 0.5,
    avgLatencyMs: 120,
    totalCalls5min: 10,
    isManuallyDisabled: false,
    disabledReason: null,
  },
];

const mockAdminInsurerMonitorService = {
  getInsurerApiDashboard: jest.fn().mockResolvedValue(mockDashboard),
  activateManualFallback: jest.fn().mockResolvedValue(undefined),
  deactivateManualFallback: jest.fn().mockResolvedValue(undefined),
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
    controllers: [AdminInsurerMonitorController],
    providers: [
      {
        provide: AdminInsurerMonitorService,
        useValue: mockAdminInsurerMonitorService,
      },
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

describe('AdminInsurerMonitorController', () => {
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

  describe('GET /admin/insurers/monitor', () => {
    it('returns 200 with insurer dashboard for super_admin', async () => {
      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get('/admin/insurers/monitor')
        .expect(200);

      const body = res.body as InsurerApiStatusResponseDto[];
      expect(body).toHaveLength(1);
      expect(body[0].insurerCode).toBe('allianz');
      expect(body[0].circuitState).toBe('closed');
      expect(body[0].errorRate5min).toBe(0.5);
      expect(body[0].isManuallyDisabled).toBe(false);
    });

    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .get('/admin/insurers/monitor')
        .expect(401);
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .get('/admin/insurers/monitor')
        .expect(403);
    });

    it('response does not contain api_key_enc', async () => {
      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get('/admin/insurers/monitor')
        .expect(200);

      expect(JSON.stringify(res.body)).not.toContain('api_key_enc');
    });
  });

  describe('POST /admin/insurers/:id/disable', () => {
    it('returns 204 when disabling a valid insurer', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post(`/admin/insurers/${VALID_UUID}/disable`)
        .send({ reason: 'API degraded' })
        .expect(204);

      expect(
        mockAdminInsurerMonitorService.activateManualFallback,
      ).toHaveBeenCalledWith(VALID_UUID, 'super-uuid', 'API degraded');
    });

    it('returns 400 for invalid UUID', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post('/admin/insurers/not-a-uuid/disable')
        .send({ reason: 'test' })
        .expect(400);
    });

    it('returns 400 when reason is missing', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post(`/admin/insurers/${VALID_UUID}/disable`)
        .send({})
        .expect(400);
    });

    it('returns 404 when insurer not found', async () => {
      mockAdminInsurerMonitorService.activateManualFallback.mockRejectedValueOnce(
        new NotFoundException('Insurer not found'),
      );

      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post(`/admin/insurers/${VALID_UUID}/disable`)
        .send({ reason: 'test' })
        .expect(404);
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .post(`/admin/insurers/${VALID_UUID}/disable`)
        .send({ reason: 'test' })
        .expect(403);
    });
  });

  describe('POST /admin/insurers/:id/enable', () => {
    it('returns 204 when enabling a valid insurer', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post(`/admin/insurers/${VALID_UUID}/enable`)
        .expect(204);

      expect(
        mockAdminInsurerMonitorService.deactivateManualFallback,
      ).toHaveBeenCalledWith(VALID_UUID, 'super-uuid');
    });

    it('returns 400 for invalid UUID', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post('/admin/insurers/not-a-uuid/enable')
        .expect(400);
    });

    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .post(`/admin/insurers/${VALID_UUID}/enable`)
        .expect(401);
    });
  });
});
