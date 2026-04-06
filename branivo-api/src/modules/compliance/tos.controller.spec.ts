import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { TosController } from './tos.controller';
import { TosPublicController } from './tos-public.controller';
import { TosService } from './tos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import type { TosListItemDto, TosResponseDto } from './dto/tos-response.dto';

const TOS_ID = 'eeeeeeee-0000-0000-0000-000000000005';

const mockService = {
  create: jest.fn(),
  publish: jest.fn(),
  findAll: jest.fn(),
  getPublished: jest.fn(),
  accept: jest.fn(),
  getStatus: jest.fn(),
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
    controllers: [TosController, TosPublicController],
    providers: [{ provide: TosService, useValue: mockService }, Reflector],
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

const sampleTosResponse: TosResponseDto = {
  id: TOS_ID,
  version: 1,
  content: '# ToS',
  language: 'bg',
  isPublished: false,
  publishedAt: null,
  createdAt: new Date('2026-04-05T00:00:00Z'),
};

const samplePublished: TosResponseDto = {
  ...sampleTosResponse,
  isPublished: true,
  publishedAt: new Date('2026-04-05T01:00:00Z'),
};

const sampleListItem: TosListItemDto = {
  id: TOS_ID,
  version: 1,
  language: 'bg',
  isPublished: true,
  publishedAt: new Date('2026-04-05T01:00:00Z'),
  createdAt: new Date('2026-04-05T00:00:00Z'),
};

describe('TosController (Admin)', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /tenants/tos', () => {
    it('creates a draft ToS for broker_admin', async () => {
      mockService.create.mockResolvedValue(sampleTosResponse);

      const res = await request(
        brokerAdminApp.getHttpServer() as import('http').Server,
      )
        .post('/tenants/tos')
        .send({ content: '# Terms', language: 'bg' });

      expect(res.status).toBe(201);
      const body = res.body as TosResponseDto;
      expect(body.version).toBe(1);
      expect(body.isPublished).toBe(false);
    });

    it('returns 403 for broker_agent', async () => {
      const res = await request(
        brokerAgentApp.getHttpServer() as import('http').Server,
      )
        .post('/tenants/tos')
        .send({ content: '# Terms', language: 'bg' });

      expect(res.status).toBe(403);
    });

    it('returns 401 for unauthenticated', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .post('/tenants/tos')
        .send({ content: '# Terms', language: 'bg' })
        .expect(401);
    });

    it('returns 400 for invalid language', async () => {
      const res = await request(
        brokerAdminApp.getHttpServer() as import('http').Server,
      )
        .post('/tenants/tos')
        .send({ content: '# Terms', language: 'de' });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /tenants/tos/:id/publish', () => {
    it('publishes a ToS for broker_admin', async () => {
      mockService.publish.mockResolvedValue(samplePublished);

      const res = await request(
        brokerAdminApp.getHttpServer() as import('http').Server,
      ).put(`/tenants/tos/${TOS_ID}/publish`);

      expect(res.status).toBe(200);
      const body = res.body as TosResponseDto;
      expect(body.isPublished).toBe(true);
    });

    it('returns 404 when ToS not found', async () => {
      mockService.publish.mockRejectedValue(
        new NotFoundException('TOS_NOT_FOUND'),
      );

      const res = await request(
        brokerAdminApp.getHttpServer() as import('http').Server,
      ).put(`/tenants/tos/${TOS_ID}/publish`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /tenants/tos', () => {
    it('returns list of all ToS versions for broker_admin', async () => {
      mockService.findAll.mockResolvedValue([sampleListItem]);

      const res = await request(
        brokerAdminApp.getHttpServer() as import('http').Server,
      ).get('/tenants/tos');

      expect(res.status).toBe(200);
      const body = res.body as TosListItemDto[];
      expect(body).toHaveLength(1);
    });

    it('returns list for broker_agent', async () => {
      mockService.findAll.mockResolvedValue([sampleListItem]);

      const res = await request(
        brokerAgentApp.getHttpServer() as import('http').Server,
      ).get('/tenants/tos');

      expect(res.status).toBe(200);
    });

    it('returns 401 for unauthenticated', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .get('/tenants/tos')
        .expect(401);
    });
  });
});

describe('TosPublicController', () => {
  let publicApp: INestApplication;

  beforeAll(async () => {
    publicApp = await buildApp(null);
  });

  afterAll(async () => {
    await publicApp.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /public/tos', () => {
    it('returns published ToS without auth', async () => {
      mockService.getPublished.mockResolvedValue(samplePublished);

      const res = await request(
        publicApp.getHttpServer() as import('http').Server,
      ).get('/public/tos?lang=bg');

      expect(res.status).toBe(200);
      const body = res.body as TosResponseDto;
      expect(body.isPublished).toBe(true);
      expect(mockService.getPublished).toHaveBeenCalledWith('bg');
    });

    it('returns 404 when no published ToS exists', async () => {
      mockService.getPublished.mockRejectedValue(
        new NotFoundException('TOS_NOT_FOUND'),
      );

      const res = await request(
        publicApp.getHttpServer() as import('http').Server,
      ).get('/public/tos');

      expect(res.status).toBe(404);
    });

    it('returns 400 for unsupported language', async () => {
      const res = await request(
        publicApp.getHttpServer() as import('http').Server,
      ).get('/public/tos?lang=de');

      expect(res.status).toBe(400);
    });
  });
});
