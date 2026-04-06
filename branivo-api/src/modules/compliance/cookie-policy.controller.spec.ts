import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { CookiePolicyController } from './cookie-policy.controller';
import { CookiePolicyPublicController } from './cookie-policy-public.controller';
import { CookiePolicyService } from './cookie-policy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import type {
  CookiePolicyListItemDto,
  CookiePolicyResponseDto,
} from './dto/cookie-policy-response.dto';

const POLICY_ID = 'dddddddd-0000-0000-0000-000000000004';

const mockService = {
  create: jest.fn(),
  publish: jest.fn(),
  findAll: jest.fn(),
  getPublished: jest.fn(),
};

const brokerAdminUser = { userId: 'broker-uuid', role: 'broker_admin' };
const brokerAgentUser = { userId: 'agent-uuid', role: 'broker_agent' };

function makeAuthGuard(user: typeof brokerAdminUser | null): {
  canActivate: (ctx: import('@nestjs/common').ExecutionContext) => boolean;
} {
  return {
    canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
      if (!user) throw new UnauthorizedException();
      const req = ctx
        .switchToHttp()
        .getRequest<{ user: typeof brokerAdminUser }>();
      req.user = user;
      return true;
    },
  };
}

async function buildApp(
  user: typeof brokerAdminUser | null,
): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [CookiePolicyController, CookiePolicyPublicController],
    providers: [
      { provide: CookiePolicyService, useValue: mockService },
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

const sampleResponse: CookiePolicyResponseDto = {
  id: POLICY_ID,
  version: 1,
  content: '# Cookie Policy',
  language: 'bg',
  isPublished: false,
  publishedAt: null,
  createdAt: new Date('2026-04-06T00:00:00Z'),
};

const samplePublished: CookiePolicyResponseDto = {
  ...sampleResponse,
  isPublished: true,
  publishedAt: new Date('2026-04-06T01:00:00Z'),
};

const sampleListItem: CookiePolicyListItemDto = {
  id: POLICY_ID,
  version: 1,
  language: 'bg',
  isPublished: true,
  publishedAt: new Date('2026-04-06T01:00:00Z'),
  createdAt: new Date('2026-04-06T00:00:00Z'),
};

describe('CookiePolicyController', () => {
  let brokerAdminApp: INestApplication;
  let brokerAgentApp: INestApplication;
  let unauthApp: INestApplication;

  beforeAll(async () => {
    brokerAdminApp = await buildApp(brokerAdminUser);
    brokerAgentApp = await buildApp(brokerAgentUser);
    unauthApp = await buildApp(null);
  });

  afterAll(async () => {
    await brokerAdminApp.close();
    await brokerAgentApp.close();
    await unauthApp.close();
  });

  beforeEach(() => jest.clearAllMocks());

  describe('POST /tenants/cookie-policy', () => {
    it('creates a draft cookie policy for broker_admin', async () => {
      mockService.create.mockResolvedValue(sampleResponse);

      const res = await request(
        brokerAdminApp.getHttpServer() as import('http').Server,
      )
        .post('/tenants/cookie-policy')
        .send({ content: '# Cookie Policy', language: 'bg' });

      expect(res.status).toBe(201);
      const body = res.body as CookiePolicyResponseDto;
      expect(body.version).toBe(1);
      expect(body.isPublished).toBe(false);
    });

    it('returns 403 for broker_agent', async () => {
      const res = await request(
        brokerAgentApp.getHttpServer() as import('http').Server,
      )
        .post('/tenants/cookie-policy')
        .send({ content: '# Cookie Policy', language: 'bg' });

      expect(res.status).toBe(403);
    });

    it('returns 401 for unauthenticated', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .post('/tenants/cookie-policy')
        .send({ content: '# Cookie Policy', language: 'bg' })
        .expect(401);
    });

    it('returns 400 for invalid language', async () => {
      const res = await request(
        brokerAdminApp.getHttpServer() as import('http').Server,
      )
        .post('/tenants/cookie-policy')
        .send({ content: '# Cookie Policy', language: 'fr' });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /tenants/cookie-policy/:id/publish', () => {
    it('publishes a cookie policy for broker_admin', async () => {
      mockService.publish.mockResolvedValue(samplePublished);

      const res = await request(
        brokerAdminApp.getHttpServer() as import('http').Server,
      ).put(`/tenants/cookie-policy/${POLICY_ID}/publish`);

      expect(res.status).toBe(200);
      const body = res.body as CookiePolicyResponseDto;
      expect(body.isPublished).toBe(true);
    });

    it('returns 404 when policy not found', async () => {
      mockService.publish.mockRejectedValue(
        new NotFoundException('COOKIE_POLICY_NOT_FOUND'),
      );

      const res = await request(
        brokerAdminApp.getHttpServer() as import('http').Server,
      ).put(`/tenants/cookie-policy/${POLICY_ID}/publish`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /tenants/cookie-policy', () => {
    it('returns list of all versions for broker_admin', async () => {
      mockService.findAll.mockResolvedValue([sampleListItem]);

      const res = await request(
        brokerAdminApp.getHttpServer() as import('http').Server,
      ).get('/tenants/cookie-policy');

      expect(res.status).toBe(200);
      const body = res.body as CookiePolicyListItemDto[];
      expect(body).toHaveLength(1);
    });

    it('returns 401 for unauthenticated', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .get('/tenants/cookie-policy')
        .expect(401);
    });
  });
});

describe('CookiePolicyPublicController', () => {
  let publicApp: INestApplication;

  beforeAll(async () => {
    publicApp = await buildApp(null);
  });

  afterAll(async () => {
    await publicApp.close();
  });

  beforeEach(() => jest.clearAllMocks());

  describe('GET /public/cookie-policy', () => {
    it('returns published cookie policy without auth', async () => {
      mockService.getPublished.mockResolvedValue(samplePublished);

      const res = await request(
        publicApp.getHttpServer() as import('http').Server,
      ).get('/public/cookie-policy?lang=bg');

      expect(res.status).toBe(200);
      const body = res.body as CookiePolicyResponseDto;
      expect(body.isPublished).toBe(true);
      expect(mockService.getPublished).toHaveBeenCalledWith('bg');
    });

    it('returns 404 when no published cookie policy', async () => {
      mockService.getPublished.mockRejectedValue(
        new NotFoundException('COOKIE_POLICY_NOT_FOUND'),
      );

      const res = await request(
        publicApp.getHttpServer() as import('http').Server,
      ).get('/public/cookie-policy');

      expect(res.status).toBe(404);
    });

    it('returns 400 for unsupported language', async () => {
      const res = await request(
        publicApp.getHttpServer() as import('http').Server,
      ).get('/public/cookie-policy?lang=de');

      expect(res.status).toBe(400);
    });
  });
});
