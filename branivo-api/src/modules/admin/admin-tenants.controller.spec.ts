import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { AdminTenantsController } from './admin-tenants.controller';
import { AdminTenantsService } from './admin-tenants.service';
import { WebhooksController } from './webhooks.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

const mockAdminTenantsService = {
  inviteTenant: jest.fn().mockResolvedValue({
    tenantId: 'tenant-uuid',
    message: 'Invitation sent',
  }),
  updateTenantStatus: jest.fn().mockResolvedValue(undefined),
  updateKfnLicense: jest.fn().mockResolvedValue(undefined),
  findAll: jest.fn().mockResolvedValue({
    data: [],
    total: 0,
    page: 1,
    limit: 20,
  }),
  findOne: jest.fn().mockResolvedValue({ id: 'tenant-uuid', name: 'Test' }),
  getOnboardingStatus: jest.fn().mockResolvedValue({
    tenantId: 'tenant-uuid',
    email: 'b@b.com',
    tenantName: 'Test',
    tenantStatus: 'invited',
  }),
  createBrokerAdminUser: jest.fn().mockResolvedValue({
    userId: 'user-uuid',
    otpauthUrl: 'otpauth://totp/test',
  }),
  initiateStripeConnect: jest.fn().mockResolvedValue({
    onboardingUrl: 'https://stripe.com/connect',
  }),
  verifyKfnAndActivate: jest.fn().mockResolvedValue(undefined),
  handleStripeAccountUpdated: jest.fn().mockResolvedValue(undefined),
};

// Mock Stripe to avoid API key requirement in tests
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: jest.fn().mockImplementation((rawBody, sig) => {
        if (sig === 'valid-sig') {
          return { type: 'account.updated', data: { object: {} } };
        }
        throw new Error('Invalid signature');
      }),
    },
  }));
});

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
    controllers: [AdminTenantsController, WebhooksController],
    providers: [
      { provide: AdminTenantsService, useValue: mockAdminTenantsService },
      {
        provide: ConfigService,
        useValue: {
          getOrThrow: jest.fn().mockReturnValue('test-secret'),
          get: jest.fn().mockReturnValue('test-value'),
        },
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

describe('AdminTenantsController', () => {
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

  describe('POST /admin/tenants/invite', () => {
    const validPayload = {
      name: 'Test Broker',
      slug: 'test-broker',
      email: 'broker@test.com',
    };

    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .post('/admin/tenants/invite')
        .send(validPayload)
        .expect(401);
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .post('/admin/tenants/invite')
        .send(validPayload)
        .expect(403);
    });

    it('returns 201 for super_admin role', async () => {
      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .post('/admin/tenants/invite')
        .send(validPayload)
        .expect(201);

      expect(res.body).toMatchObject({
        tenantId: 'tenant-uuid',
        message: 'Invitation sent',
      });
    });
  });

  describe('GET /admin/tenants', () => {
    it('returns 200 paginated list for super_admin', async () => {
      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get('/admin/tenants')
        .expect(200);

      expect(res.body).toMatchObject({ data: [], total: 0 });
    });

    it('returns 401 without auth', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .get('/admin/tenants')
        .expect(401);
    });
  });

  describe('GET /admin/tenants/onboarding/:token', () => {
    it('returns 200 without authentication (public endpoint)', async () => {
      const res = await request(
        unauthApp.getHttpServer() as import('http').Server,
      )
        .get('/admin/tenants/onboarding/valid-token')
        .expect(200);

      expect(res.body).toMatchObject({ tenantStatus: 'invited' });
    });
  });

  describe('POST /admin/tenants/onboarding/:token/stripe-connect', () => {
    it('returns 201 without authentication (public broker endpoint)', async () => {
      const res = await request(
        unauthApp.getHttpServer() as import('http').Server,
      )
        .post('/admin/tenants/onboarding/valid-token/stripe-connect')
        .expect(201);

      expect(res.body).toMatchObject({
        onboardingUrl: 'https://stripe.com/connect',
      });
    });
  });

  describe('POST /admin/tenants/onboarding/:token/verify-kfn', () => {
    it('returns 201 without authentication (public broker endpoint)', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .post('/admin/tenants/onboarding/valid-token/verify-kfn')
        .send({ kfn_license: '12345' })
        .expect(201);

      expect(mockAdminTenantsService.verifyKfnAndActivate).toHaveBeenCalledWith(
        'tenant-uuid',
        '12345',
        null,
      );
    });
  });

  describe('GET /admin/tenants response — sensitive data', () => {
    it('response never contains stripe_webhook_secret or sensitive data', async () => {
      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get('/admin/tenants')
        .expect(200);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain('stripe_webhook_secret');
      expect(body).not.toContain('STRIPE_WEBHOOK_SECRET');
      expect(body).not.toContain('api_key_enc');
    });
  });

  describe('PATCH /admin/tenants/:id/status', () => {
    const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .patch(`/admin/tenants/${VALID_UUID}/status`)
        .send({ status: 'suspended' })
        .expect(401);
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .patch(`/admin/tenants/${VALID_UUID}/status`)
        .send({ status: 'suspended' })
        .expect(403);
    });

    it('returns 204 for super_admin with valid active→suspended transition', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch(`/admin/tenants/${VALID_UUID}/status`)
        .send({ status: 'suspended' })
        .expect(204);

      expect(mockAdminTenantsService.updateTenantStatus).toHaveBeenCalledWith(
        VALID_UUID,
        'suspended',
        'super-uuid',
      );
    });

    it('returns 400 for invalid UUID in :id param', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch('/admin/tenants/not-a-uuid/status')
        .send({ status: 'suspended' })
        .expect(400);
    });

    it('returns 400 for invalid status value', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch(`/admin/tenants/${VALID_UUID}/status`)
        .send({ status: 'invited' })
        .expect(400);
    });

    it('returns 400 for missing status field', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch(`/admin/tenants/${VALID_UUID}/status`)
        .send({})
        .expect(400);
    });
  });

  describe('PATCH /admin/tenants/:id/kfn-license', () => {
    const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    it('returns 204 for super_admin with valid license', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch(`/admin/tenants/${VALID_UUID}/kfn-license`)
        .send({ kfn_license: '12345' })
        .expect(204);

      expect(mockAdminTenantsService.updateKfnLicense).toHaveBeenCalledWith(
        VALID_UUID,
        '12345',
        'super-uuid',
      );
    });

    it('returns 400 for invalid license format (non-digits)', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch(`/admin/tenants/${VALID_UUID}/kfn-license`)
        .send({ kfn_license: 'ABC' })
        .expect(400);
    });

    it('returns 400 for license that is too short (2 digits)', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch(`/admin/tenants/${VALID_UUID}/kfn-license`)
        .send({ kfn_license: '12' })
        .expect(400);
    });

    it('returns 400 for license that is too long (11 digits)', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch(`/admin/tenants/${VALID_UUID}/kfn-license`)
        .send({ kfn_license: '12345678901' })
        .expect(400);
    });

    it('returns 400 for missing kfn_license field', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch(`/admin/tenants/${VALID_UUID}/kfn-license`)
        .send({})
        .expect(400);
    });

    it('returns 403 for broker_admin role', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .patch(`/admin/tenants/${VALID_UUID}/kfn-license`)
        .send({ kfn_license: '12345' })
        .expect(403);
    });

    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .patch(`/admin/tenants/${VALID_UUID}/kfn-license`)
        .send({ kfn_license: '12345' })
        .expect(401);
    });

    it('returns 400 for invalid UUID in :id param', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch('/admin/tenants/not-a-uuid/kfn-license')
        .send({ kfn_license: '12345' })
        .expect(400);
    });
  });

  describe('POST /webhooks/stripe', () => {
    it('returns 400 for missing stripe-signature header', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post('/webhooks/stripe')
        .send(Buffer.from('raw-body'))
        .expect(400);
    });

    it('returns 400 for invalid stripe signature', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post('/webhooks/stripe')
        .set('stripe-signature', 'invalid-sig')
        .send(Buffer.from('raw-body'))
        .expect(400);
    });
  });
});
