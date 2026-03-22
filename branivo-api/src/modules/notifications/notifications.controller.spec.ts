import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { default as request } from 'supertest';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RenewalConfigResponseDto } from './dto/renewal-config-response.dto';
import { StageConfig } from './entities/tenant-renewal-config.entity';

const SUPER_ADMIN_USER = { userId: 'admin-user-id', role: 'super_admin' };

const DEMO_STAGES: StageConfig[] = [
  { stage: 'd_minus_30', channels: ['push'], enabled: true },
  { stage: 'd_minus_7', channels: ['push'], enabled: true },
  { stage: 'd_minus_3', channels: ['sms'], enabled: true },
  { stage: 'd_minus_1', channels: ['email'], enabled: true },
  { stage: 'd_plus_1', channels: ['dashboard'], enabled: true },
];

const DEMO_CONFIG_RESPONSE: RenewalConfigResponseDto = {
  tenantId: 'tenant-uuid-1',
  stages: DEMO_STAGES,
  isDefault: false,
};

const mockNotificationsService = {
  getTenantRenewalConfig: jest.fn().mockResolvedValue(DEMO_CONFIG_RESPONSE),
  upsertTenantRenewalConfig: jest.fn().mockResolvedValue(DEMO_CONFIG_RESPONSE),
};

function makeJwtGuard(allow: boolean) {
  return {
    canActivate: (ctx: ExecutionContext) => {
      if (!allow) return false;
      const req = ctx
        .switchToHttp()
        .getRequest<{ user: typeof SUPER_ADMIN_USER }>();
      req.user = SUPER_ADMIN_USER;
      return true;
    },
  };
}

const mockRolesGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

describe('NotificationsController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRolesGuard.canActivate.mockReturnValue(true);
    mockNotificationsService.getTenantRenewalConfig.mockResolvedValue(
      DEMO_CONFIG_RESPONSE,
    );
    mockNotificationsService.upsertTenantRenewalConfig.mockResolvedValue(
      DEMO_CONFIG_RESPONSE,
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(makeJwtGuard(true))
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /notifications/config/:tenantId', () => {
    it('returns 200 with renewal config (AC6)', async () => {
      const response = await request(
        app.getHttpServer() as import('http').Server,
      )
        .get('/notifications/config/tenant-uuid-1')
        .expect(200);

      const body = response.body as RenewalConfigResponseDto;
      expect(body.tenantId).toBe('tenant-uuid-1');
      expect(body.stages).toBeDefined();
      expect(
        mockNotificationsService.getTenantRenewalConfig,
      ).toHaveBeenCalledWith('tenant-uuid-1');
    });
  });

  describe('PUT /notifications/config/:tenantId', () => {
    it('returns 200 after successful UPSERT (AC7)', async () => {
      const dto = { stages: DEMO_STAGES };

      const response = await request(
        app.getHttpServer() as import('http').Server,
      )
        .put('/notifications/config/tenant-uuid-1')
        .send(dto)
        .expect(200);

      const body = response.body as RenewalConfigResponseDto;
      expect(body.tenantId).toBe('tenant-uuid-1');
      expect(body.isDefault).toBe(false);
    });

    it('returns 403 when RolesGuard denies access (AC7)', async () => {
      mockRolesGuard.canActivate.mockReturnValue(false);

      await request(app.getHttpServer() as import('http').Server)
        .put('/notifications/config/tenant-uuid-1')
        .send({ stages: DEMO_STAGES })
        .expect(403);
    });
  });

  describe('Authentication guard', () => {
    let unauthApp: INestApplication;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [NotificationsController],
        providers: [
          { provide: NotificationsService, useValue: mockNotificationsService },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(makeJwtGuard(false))
        .overrideGuard(RolesGuard)
        .useValue(mockRolesGuard)
        .compile();

      unauthApp = module.createNestApplication();
      unauthApp.useGlobalPipes(new ValidationPipe({ whitelist: true }));
      await unauthApp.init();
    });

    afterEach(async () => {
      await unauthApp.close();
    });

    it('GET returns 403 when JwtAuthGuard denies (unauthenticated)', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .get('/notifications/config/tenant-uuid-1')
        .expect(403);
    });

    it('PUT returns 403 when JwtAuthGuard denies (unauthenticated)', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .put('/notifications/config/tenant-uuid-1')
        .send({ stages: DEMO_STAGES })
        .expect(403);
    });
  });
});
