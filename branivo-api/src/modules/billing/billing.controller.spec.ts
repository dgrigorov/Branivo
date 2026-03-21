import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';

const mockBillingService = {
  runManualBilling: jest.fn().mockResolvedValue(undefined),
};

const TENANT_UUID = 'a1b2c3d4-e5f6-4890-8bcd-ef1234567890';

function makeJwtGuard(role: string) {
  return {
    canActivate: (context: import('@nestjs/common').ExecutionContext) => {
      const req = context.switchToHttp().getRequest<{
        user: { userId: string; role: string; tenantId: string };
      }>();
      req.user = { userId: 'user-1', role, tenantId: '' };
      return true;
    },
  };
}

async function buildApp(
  canActivate: boolean,
  role: string,
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [BillingController],
    providers: [
      { provide: BillingService, useValue: mockBillingService },
      Reflector,
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(makeJwtGuard(role))
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => canActivate })
    .compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();
  return app;
}

describe('BillingController — super_admin', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp(true, 'super_admin');
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /admin/billing/run returns 201 for super_admin', async () => {
    const res = await request(app.getHttpServer() as import('http').Server)
      .post('/admin/billing/run')
      .send({})
      .expect(201);

    const body = res.body as { message: string };
    expect(body.message).toBe('Billing run initiated');
    expect(mockBillingService.runManualBilling).toHaveBeenCalledWith(undefined);
  });

  it('POST /admin/billing/run with tenantId calls service with uuid', async () => {
    const res = await request(app.getHttpServer() as import('http').Server)
      .post('/admin/billing/run')
      .send({ tenantId: TENANT_UUID })
      .expect(201);

    const body = res.body as { message: string };
    expect(body.message).toBe('Billing run initiated');
    expect(mockBillingService.runManualBilling).toHaveBeenCalledWith(
      TENANT_UUID,
    );
  });

  it('POST returns 400 for invalid UUID as tenantId', async () => {
    await request(app.getHttpServer() as import('http').Server)
      .post('/admin/billing/run')
      .send({ tenantId: 'not-a-uuid' })
      .expect(400);
  });
});

describe('BillingController — broker_admin (wrong role)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp(false, 'broker_admin');
  });

  afterAll(() => app.close());

  it('POST /admin/billing/run returns 403 for broker_admin', async () => {
    await request(app.getHttpServer() as import('http').Server)
      .post('/admin/billing/run')
      .send({})
      .expect(403);
  });
});
