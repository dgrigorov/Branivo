/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { Reflector } from '@nestjs/core';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureFlagDefinition } from './dto/feature-flags-response.dto';

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockFlags: FeatureFlagDefinition[] = [
  {
    key: 'fleet',
    enabled: false,
    planRestricted: true,
    requiredPlan: 'professional',
  },
  {
    key: 'kasko',
    enabled: false,
    planRestricted: true,
    requiredPlan: 'professional',
  },
  {
    key: 'api_access',
    enabled: false,
    planRestricted: true,
    requiredPlan: 'professional',
  },
  {
    key: 'sticker_delivery',
    enabled: true,
    planRestricted: false,
    requiredPlan: null,
  },
  { key: 'dkp', enabled: false, planRestricted: false, requiredPlan: null },
  {
    key: 'renewal_sms',
    enabled: false,
    planRestricted: false,
    requiredPlan: null,
  },
  {
    key: 'renewal_push',
    enabled: false,
    planRestricted: false,
    requiredPlan: null,
  },
];

const mockFeatureFlagsService = {
  getFeatureFlags: jest.fn().mockResolvedValue({ flags: mockFlags }),
  updateFeatureFlags: jest.fn().mockResolvedValue(undefined),
};

// ─── Users ────────────────────────────────────────────────────────────────────

const brokerAdminUser = {
  id: 'user-uuid-1',
  role: 'broker_admin',
  tenantId: 'tenant-uuid-1',
};
const superAdminUser = {
  id: 'user-uuid-2',
  role: 'super_admin',
  tenantId: null,
};

// ─── App factory ──────────────────────────────────────────────────────────────

function makeAuthGuard(
  user: typeof brokerAdminUser | typeof superAdminUser | null,
) {
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
  user: typeof brokerAdminUser | typeof superAdminUser | null,
): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [FeatureFlagsController],
    providers: [
      { provide: FeatureFlagsService, useValue: mockFeatureFlagsService },
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
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FeatureFlagsController (HTTP)', () => {
  let brokerApp: INestApplication;
  let superAdminApp: INestApplication;
  let unauthApp: INestApplication;

  beforeAll(async () => {
    brokerApp = await buildApp(brokerAdminUser);
    superAdminApp = await buildApp(superAdminUser);
    unauthApp = await buildApp(null);
  });

  afterAll(async () => {
    await brokerApp.close();
    await superAdminApp.close();
    await unauthApp.close();
  });

  beforeEach(() => jest.clearAllMocks());

  // ─── GET /tenants/features ──────────────────────────────────────────────────

  describe('GET /tenants/features', () => {
    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer())
        .get('/tenants/features')
        .expect(401);
    });

    it('returns 403 for super_admin role (broker_admin only endpoint)', async () => {
      mockFeatureFlagsService.getFeatureFlags.mockResolvedValueOnce({
        flags: mockFlags,
      });
      await request(superAdminApp.getHttpServer())
        .get('/tenants/features')
        .expect(403);
    });

    it('returns 200 with array of 7 flags for broker_admin', async () => {
      mockFeatureFlagsService.getFeatureFlags.mockResolvedValueOnce({
        flags: mockFlags,
      });

      const res = await request(brokerApp.getHttpServer())
        .get('/tenants/features')
        .expect(200);

      expect(res.body).toMatchObject({ data: { flags: expect.any(Array) } });
      expect(res.body.data.flags).toHaveLength(7);
    });
  });

  // ─── PATCH /tenants/features ────────────────────────────────────────────────

  describe('PATCH /tenants/features', () => {
    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer())
        .patch('/tenants/features')
        .send({ renewal_sms: true })
        .expect(401);
    });

    it('returns 400 for invalid boolean value', async () => {
      await request(brokerApp.getHttpServer())
        .patch('/tenants/features')
        .send({ renewal_sms: 'not-a-boolean' })
        .expect(400);
    });

    it('returns 400 for unknown flag key (forbidNonWhitelisted)', async () => {
      await request(brokerApp.getHttpServer())
        .patch('/tenants/features')
        .send({ unknown_flag: true })
        .expect(400);
    });

    it('returns 204 for valid flag update by broker_admin', async () => {
      mockFeatureFlagsService.updateFeatureFlags.mockResolvedValueOnce(
        undefined,
      );

      await request(brokerApp.getHttpServer())
        .patch('/tenants/features')
        .send({ renewal_sms: true })
        .expect(204);

      expect(mockFeatureFlagsService.updateFeatureFlags).toHaveBeenCalledWith(
        { renewal_sms: true },
        brokerAdminUser.id,
      );
    });

    it('returns 403 for super_admin role', async () => {
      await request(superAdminApp.getHttpServer())
        .patch('/tenants/features')
        .send({ renewal_sms: true })
        .expect(403);
    });

    it('returns 403 when service throws ForbiddenException (plan restriction)', async () => {
      mockFeatureFlagsService.updateFeatureFlags.mockRejectedValueOnce(
        new ForbiddenException(
          "Feature 'fleet' requires professional or Enterprise plan",
        ),
      );

      const res = await request(brokerApp.getHttpServer())
        .patch('/tenants/features')
        .send({ fleet: true })
        .expect(403);

      expect(res.body.message).toContain(
        'requires professional or Enterprise plan',
      );
    });
  });
});
