import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { OcrAnalyticsController } from './ocr-analytics.controller';
import { OcrAnalyticsService } from './ocr-analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import type {
  OcrAnalyticsResponseDto,
  OcrTrendPoint,
} from './dto/ocr-analytics.dto';

const mockAnalyticsService = {
  getAnalytics: jest.fn(),
  getTrend: jest.fn(),
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
    controllers: [OcrAnalyticsController],
    providers: [
      { provide: OcrAnalyticsService, useValue: mockAnalyticsService },
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
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

describe('OcrAnalyticsController (integration)', () => {
  let superAdminApp: INestApplication;
  let brokerApp: INestApplication;
  let unauthApp: INestApplication;

  const mockAnalyticsResponse: OcrAnalyticsResponseDto = {
    stats: [
      {
        fieldName: 'license_plate',
        avgConfidence: 0.97,
        fallbackRate: 0.05,
        totalJobs: 100,
      },
      {
        fieldName: 'vin',
        avgConfidence: 0.7,
        fallbackRate: 0.25,
        totalJobs: 80,
      },
    ],
    days: 7,
    generatedAt: new Date().toISOString(),
  };

  const mockTrendResponse: OcrTrendPoint[] = [
    {
      date: '2026-03-13',
      avgConfidence: 0.9,
      fallbackRate: 0.1,
      totalJobs: 20,
    },
    {
      date: '2026-03-14',
      avgConfidence: 0.85,
      fallbackRate: 0.15,
      totalJobs: 25,
    },
  ];

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

  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyticsService.getAnalytics.mockResolvedValue(mockAnalyticsResponse);
    mockAnalyticsService.getTrend.mockResolvedValue(mockTrendResponse);
  });

  describe('GET /ocr/analytics', () => {
    it('returns 200 with analytics data for super_admin', async () => {
      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get('/ocr/analytics')
        .expect(200);

      const body = res.body as OcrAnalyticsResponseDto;
      expect(body.stats).toHaveLength(2);
      expect(body.days).toBe(7);
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .get('/ocr/analytics')
        .expect(403);
    });

    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .get('/ocr/analytics')
        .expect(401);
    });

    it('passes query params to service', async () => {
      const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .get(`/ocr/analytics?tenantId=${TENANT_ID}&days=30`)
        .expect(200);

      expect(mockAnalyticsService.getAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, days: 30 }),
      );
    });

    it('returns 400 for invalid tenantId (not UUID)', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .get('/ocr/analytics?tenantId=not-a-uuid')
        .expect(400);
    });
  });

  describe('GET /ocr/analytics/trend', () => {
    it('returns 200 with trend data for super_admin', async () => {
      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get('/ocr/analytics/trend?field=vin')
        .expect(200);

      const body = res.body as OcrTrendPoint[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
    });

    it('returns 400 when field param is missing', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .get('/ocr/analytics/trend')
        .expect(400);
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .get('/ocr/analytics/trend?field=vin')
        .expect(403);
    });
  });
});
