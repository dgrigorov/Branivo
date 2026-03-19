import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { AnonymousSessionsController } from './anonymous-sessions.controller';
import { AnonymousSessionsService } from './anonymous-sessions.service';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const TENANT_ID = 'tenant-uuid-test';
const SESSION_ID = 'session-uuid-test';

const mockSessionsService = {
  createSession: jest.fn(),
  getSession: jest.fn(),
  updateSessionData: jest.fn(),
  migrateSession: jest.fn(),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

describe('AnonymousSessionsController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnonymousSessionsController],
      providers: [
        { provide: AnonymousSessionsService, useValue: mockSessionsService },
        { provide: TenantContext, useValue: mockTenantContext },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => object };
        }) => {
          const req = ctx.switchToHttp().getRequest() as Record<
            string,
            unknown
          >;
          req.user = { sub: 'user-uuid' };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('POST /sessions/anonymous', () => {
    it('returns 201 with session_id and expires_at', async () => {
      mockSessionsService.createSession.mockResolvedValueOnce({
        session_id: SESSION_ID,
        expires_at: '2026-03-21T10:00:00.000Z',
      });

      await request(app.getHttpServer())
        .post('/sessions/anonymous')
        .expect(201)
        .expect((res: { body: { session_id: string; expires_at: string } }) => {
          expect(res.body.session_id).toBe(SESSION_ID);
          expect(res.body.expires_at).toBeDefined();
        });
    });
  });

  describe('GET /sessions/anonymous/:id', () => {
    it('returns 404 for non-existing session ID', async () => {
      mockSessionsService.getSession.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get(`/sessions/anonymous/${SESSION_ID}`)
        .expect(404);
    });

    it('returns 200 with session data for existing session', async () => {
      mockSessionsService.getSession.mockResolvedValueOnce({
        session_id: SESSION_ID,
        tenant_id: TENANT_ID,
        created_at: '2026-03-19T10:00:00.000Z',
      });

      await request(app.getHttpServer())
        .get(`/sessions/anonymous/${SESSION_ID}`)
        .expect(200)
        .expect((res: { body: { session_id: string } }) => {
          expect(res.body.session_id).toBe(SESSION_ID);
        });
    });
  });

  describe('PUT /sessions/anonymous/:id/data', () => {
    it('returns 200 with valid body', async () => {
      mockSessionsService.updateSessionData.mockResolvedValueOnce(undefined);

      await request(app.getHttpServer())
        .put(`/sessions/anonymous/${SESSION_ID}/data`)
        .send({
          vehicle_data: {
            reg_number: 'CA1234AB',
            make: 'VW',
            model: 'Golf',
            year: 2020,
          },
        })
        .expect(200);
    });
  });

  describe('POST /sessions/anonymous/:id/migrate', () => {
    it('requires JWT — overridden guard allows access and returns 200', async () => {
      mockSessionsService.migrateSession.mockResolvedValueOnce({
        session_id: SESSION_ID,
        tenant_id: TENANT_ID,
        created_at: '2026-03-19T10:00:00.000Z',
      });

      await request(app.getHttpServer())
        .post(`/sessions/anonymous/${SESSION_ID}/migrate`)
        .expect(200);
    });
  });
});
