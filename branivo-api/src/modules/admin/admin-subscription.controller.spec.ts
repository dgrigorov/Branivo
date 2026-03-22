import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { AdminSubscriptionController } from './admin-subscription.controller';
import { AdminSubscriptionService } from './admin-subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { TierChangePreviewResponseDto } from './dto/tier-change-preview-response.dto';

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockUpgradePreview: TierChangePreviewResponseDto = {
  oldPlan: 'starter',
  newPlan: 'professional',
  isUpgrade: true,
  affectedFlags: [],
  graceEndsAt: null,
};

const mockDowngradePreview: TierChangePreviewResponseDto = {
  oldPlan: 'professional',
  newPlan: 'starter',
  isUpgrade: false,
  affectedFlags: ['fleet', 'api_access'],
  graceEndsAt: '2026-03-29T00:00:00.000Z',
};

const mockAdminSubscriptionService = {
  previewTierChange: jest.fn().mockResolvedValue(mockUpgradePreview),
  changeTier: jest.fn().mockResolvedValue(mockUpgradePreview),
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
    controllers: [AdminSubscriptionController],
    providers: [
      {
        provide: AdminSubscriptionService,
        useValue: mockAdminSubscriptionService,
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

describe('AdminSubscriptionController', () => {
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

  describe('GET /admin/tenants/:id/subscription/preview', () => {
    it('returns 200 with upgrade preview for super_admin', async () => {
      mockAdminSubscriptionService.previewTierChange.mockResolvedValue(
        mockUpgradePreview,
      );

      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get(
          `/admin/tenants/${VALID_UUID}/subscription/preview?newPlan=professional`,
        )
        .expect(200);

      const body = res.body as TierChangePreviewResponseDto;
      expect(body.isUpgrade).toBe(true);
      expect(body.affectedFlags).toEqual([]);
      expect(body.graceEndsAt).toBeNull();
      expect(
        mockAdminSubscriptionService.previewTierChange,
      ).toHaveBeenCalledWith(VALID_UUID, 'professional');
    });

    it('returns 200 with downgrade preview including affectedFlags', async () => {
      mockAdminSubscriptionService.previewTierChange.mockResolvedValue(
        mockDowngradePreview,
      );

      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get(
          `/admin/tenants/${VALID_UUID}/subscription/preview?newPlan=starter`,
        )
        .expect(200);

      const body = res.body as TierChangePreviewResponseDto;
      expect(body.isUpgrade).toBe(false);
      expect(body.affectedFlags).toContain('fleet');
      expect(body.graceEndsAt).not.toBeNull();
    });

    it('returns 404 when tenant not found', async () => {
      mockAdminSubscriptionService.previewTierChange.mockRejectedValueOnce(
        new NotFoundException('Tenant not found'),
      );

      await request(superAdminApp.getHttpServer() as import('http').Server)
        .get(
          `/admin/tenants/${VALID_UUID}/subscription/preview?newPlan=professional`,
        )
        .expect(404);
    });

    it('returns 400 for invalid UUID', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .get(
          '/admin/tenants/not-a-uuid/subscription/preview?newPlan=professional',
        )
        .expect(400);
    });

    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .get(
          `/admin/tenants/${VALID_UUID}/subscription/preview?newPlan=professional`,
        )
        .expect(401);
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .get(
          `/admin/tenants/${VALID_UUID}/subscription/preview?newPlan=professional`,
        )
        .expect(403);
    });
  });

  describe('POST /admin/tenants/:id/subscription/tier', () => {
    it('returns 200 with tier change result for super_admin', async () => {
      mockAdminSubscriptionService.changeTier.mockResolvedValue(
        mockUpgradePreview,
      );

      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .post(`/admin/tenants/${VALID_UUID}/subscription/tier`)
        .send({ newPlan: 'professional' })
        .expect(200);

      const body = res.body as TierChangePreviewResponseDto;
      expect(body.isUpgrade).toBe(true);
      expect(mockAdminSubscriptionService.changeTier).toHaveBeenCalledWith(
        VALID_UUID,
        'professional',
        'super-uuid',
      );
    });

    it('returns 400 for invalid plan value', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post(`/admin/tenants/${VALID_UUID}/subscription/tier`)
        .send({ newPlan: 'mega-plan' })
        .expect(400);
    });

    it('returns 400 for missing newPlan', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post(`/admin/tenants/${VALID_UUID}/subscription/tier`)
        .send({})
        .expect(400);
    });

    it('returns 400 when tenant already on same plan', async () => {
      mockAdminSubscriptionService.changeTier.mockRejectedValueOnce(
        new BadRequestException('Tenant is already on this plan'),
      );

      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post(`/admin/tenants/${VALID_UUID}/subscription/tier`)
        .send({ newPlan: 'starter' })
        .expect(400);
    });

    it('returns 400 for invalid UUID', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post('/admin/tenants/not-a-uuid/subscription/tier')
        .send({ newPlan: 'professional' })
        .expect(400);
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .post(`/admin/tenants/${VALID_UUID}/subscription/tier`)
        .send({ newPlan: 'professional' })
        .expect(403);
    });

    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .post(`/admin/tenants/${VALID_UUID}/subscription/tier`)
        .send({ newPlan: 'professional' })
        .expect(401);
    });
  });
});
