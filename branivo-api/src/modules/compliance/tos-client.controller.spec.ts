import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { TosClientController } from './tos-client.controller';
import { TosService } from './tos.service';
import { ClientJwtAuthGuard } from '../clients/guards/client-jwt-auth.guard';
import type {
  TosAcceptanceResponseDto,
  TosResponseDto,
  TosStatusResponseDto,
} from './dto/tos-response.dto';

const TOS_ID = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee';
const CLIENT_ID = 'dddddddd-dddd-4ddd-addd-dddddddddddd';

const mockService = {
  accept: jest.fn(),
  getStatus: jest.fn(),
};

const clientUser = { userId: CLIENT_ID, role: 'end_client' };

function makeClientAuthGuard(user: typeof clientUser | null): {
  canActivate: (ctx: import('@nestjs/common').ExecutionContext) => boolean;
} {
  return {
    canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
      if (!user) throw new UnauthorizedException();
      const req = ctx.switchToHttp().getRequest<{ user: typeof clientUser }>();
      req.user = user;
      return true;
    },
  };
}

async function buildApp(
  user: typeof clientUser | null,
): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [TosClientController],
    providers: [{ provide: TosService, useValue: mockService }],
  })
    .overrideGuard(ClientJwtAuthGuard)
    .useValue(makeClientAuthGuard(user))
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
  isPublished: true,
  publishedAt: new Date('2026-04-05T01:00:00Z'),
  createdAt: new Date('2026-04-05T00:00:00Z'),
};

describe('TosClientController', () => {
  let clientApp: INestApplication;
  let unauthApp: INestApplication;

  beforeAll(async () => {
    clientApp = await buildApp(clientUser);
    unauthApp = await buildApp(null);
  });

  afterAll(async () => {
    await clientApp.close();
    await unauthApp.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /clients/tos/accept', () => {
    it('records acceptance and returns accepted: true', async () => {
      const acceptResponse: TosAcceptanceResponseDto = {
        accepted: true,
        version: 1,
        acceptedAt: new Date('2026-04-05T01:00:00Z'),
      };
      mockService.accept.mockResolvedValue(acceptResponse);

      const res = await request(
        clientApp.getHttpServer() as import('http').Server,
      )
        .post('/clients/tos/accept')
        .send({ tosVersionId: TOS_ID });

      expect(res.status).toBe(200);
      const body = res.body as TosAcceptanceResponseDto;
      expect(body.accepted).toBe(true);
      expect(body.version).toBe(1);
      expect(mockService.accept).toHaveBeenCalledWith(
        CLIENT_ID,
        expect.objectContaining({ tosVersionId: TOS_ID }),
        null,
        null,
      );
    });

    it('returns 400 for invalid tosVersionId (not UUID)', async () => {
      const res = await request(
        clientApp.getHttpServer() as import('http').Server,
      )
        .post('/clients/tos/accept')
        .send({ tosVersionId: 'not-a-uuid' });

      expect(res.status).toBe(400);
    });

    it('returns 401 for unauthenticated', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .post('/clients/tos/accept')
        .send({ tosVersionId: TOS_ID })
        .expect(401);
    });
  });

  describe('GET /clients/tos/status', () => {
    it('returns status with requiresAcceptance when client has not accepted', async () => {
      const statusResponse: TosStatusResponseDto = {
        requiresAcceptance: true,
        currentVersion: sampleTosResponse,
        acceptedVersion: null,
      };
      mockService.getStatus.mockResolvedValue(statusResponse);

      const res = await request(
        clientApp.getHttpServer() as import('http').Server,
      ).get('/clients/tos/status');

      expect(res.status).toBe(200);
      const body = res.body as TosStatusResponseDto;
      expect(body.requiresAcceptance).toBe(true);
      expect(mockService.getStatus).toHaveBeenCalledWith(CLIENT_ID);
    });

    it('returns requiresAcceptance=false when up to date', async () => {
      const statusResponse: TosStatusResponseDto = {
        requiresAcceptance: false,
        currentVersion: sampleTosResponse,
        acceptedVersion: 1,
      };
      mockService.getStatus.mockResolvedValue(statusResponse);

      const res = await request(
        clientApp.getHttpServer() as import('http').Server,
      ).get('/clients/tos/status');

      expect(res.status).toBe(200);
      const body = res.body as TosStatusResponseDto;
      expect(body.requiresAcceptance).toBe(false);
    });

    it('returns 401 for unauthenticated', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .get('/clients/tos/status')
        .expect(401);
    });
  });
});
