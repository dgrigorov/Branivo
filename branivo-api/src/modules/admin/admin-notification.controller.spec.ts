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
import { AdminNotificationController } from './admin-notification.controller';
import { AdminNotificationService } from './admin-notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { SystemNotificationResponseDto } from './dto/system-notification-response.dto';

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockNotification: SystemNotificationResponseDto = {
  id: VALID_UUID,
  adminId: 'admin-uuid-001',
  target: 'all',
  type: 'info',
  message: 'Test notification',
  dismissible: true,
  isActive: true,
  sentAt: new Date().toISOString(),
};

const mockAdminNotificationService = {
  broadcast: jest.fn().mockResolvedValue(mockNotification),
  listAll: jest.fn().mockResolvedValue([mockNotification]),
  deactivate: jest.fn().mockResolvedValue(undefined),
  getActiveForTenant: jest.fn().mockResolvedValue([mockNotification]),
  dismiss: jest.fn().mockResolvedValue(undefined),
};

const superAdminUser = {
  userId: 'super-uuid',
  role: 'super_admin',
  tenantId: '',
};
const brokerAdminUser = {
  userId: 'broker-uuid',
  role: 'broker_admin',
  tenantId: 'tenant-uuid-001',
};

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
    controllers: [AdminNotificationController],
    providers: [
      {
        provide: AdminNotificationService,
        useValue: mockAdminNotificationService,
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

describe('AdminNotificationController', () => {
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

  describe('POST /admin/notifications', () => {
    it('returns 401 without authentication', async () => {
      await request(unauthApp.getHttpServer() as import('http').Server)
        .post('/admin/notifications')
        .send({ message: 'Test', type: 'info' })
        .expect(401);
    });

    it('returns 403 when not super_admin', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .post('/admin/notifications')
        .send({ message: 'Test', type: 'info' })
        .expect(403);
    });

    it('returns 201 for super_admin with valid body', async () => {
      mockAdminNotificationService.broadcast.mockResolvedValue(
        mockNotification,
      );

      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .post('/admin/notifications')
        .send({ message: 'Test notification', type: 'info' })
        .expect(201);

      const body = res.body as SystemNotificationResponseDto;
      expect(body.type).toBe('info');
      expect(mockAdminNotificationService.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Test notification', type: 'info' }),
        'super-uuid',
      );
    });

    it('returns 400 for invalid type', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post('/admin/notifications')
        .send({ message: 'Test', type: 'invalid-type' })
        .expect(400);
    });

    it('returns 400 for missing message', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post('/admin/notifications')
        .send({ type: 'info' })
        .expect(400);
    });
  });

  describe('GET /admin/notifications', () => {
    it('returns 403 for broker_admin role', async () => {
      await request(brokerApp.getHttpServer() as import('http').Server)
        .get('/admin/notifications')
        .expect(403);
    });

    it('returns 200 for super_admin', async () => {
      mockAdminNotificationService.listAll.mockResolvedValue([
        mockNotification,
      ]);

      const res = await request(
        superAdminApp.getHttpServer() as import('http').Server,
      )
        .get('/admin/notifications')
        .expect(200);

      const body = res.body as SystemNotificationResponseDto[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
    });
  });

  describe('PATCH /admin/notifications/:id/deactivate', () => {
    it('returns 204 on success', async () => {
      mockAdminNotificationService.deactivate.mockResolvedValue(undefined);

      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch(`/admin/notifications/${VALID_UUID}/deactivate`)
        .expect(204);
    });

    it('returns 404 when notification not found', async () => {
      mockAdminNotificationService.deactivate.mockRejectedValueOnce(
        new NotFoundException('Notification not found or already inactive'),
      );

      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch(`/admin/notifications/${VALID_UUID}/deactivate`)
        .expect(404);
    });

    it('returns 400 for invalid UUID', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .patch('/admin/notifications/not-a-uuid/deactivate')
        .expect(400);
    });
  });

  describe('GET /admin/notifications/active', () => {
    it('returns 403 for super_admin role', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .get('/admin/notifications/active')
        .expect(403);
    });

    it('returns 200 for broker_admin', async () => {
      mockAdminNotificationService.getActiveForTenant.mockResolvedValue([
        mockNotification,
      ]);

      const res = await request(
        brokerApp.getHttpServer() as import('http').Server,
      )
        .get('/admin/notifications/active')
        .expect(200);

      const body = res.body as SystemNotificationResponseDto[];
      expect(Array.isArray(body)).toBe(true);
      expect(
        mockAdminNotificationService.getActiveForTenant,
      ).toHaveBeenCalledWith('tenant-uuid-001');
    });
  });

  describe('POST /admin/notifications/:id/dismiss', () => {
    it('returns 400 when notification is critical (non-dismissible)', async () => {
      mockAdminNotificationService.dismiss.mockRejectedValueOnce(
        new BadRequestException('Critical notifications cannot be dismissed'),
      );

      await request(brokerApp.getHttpServer() as import('http').Server)
        .post(`/admin/notifications/${VALID_UUID}/dismiss`)
        .expect(400);
    });

    it('returns 204 on success', async () => {
      mockAdminNotificationService.dismiss.mockResolvedValue(undefined);

      await request(brokerApp.getHttpServer() as import('http').Server)
        .post(`/admin/notifications/${VALID_UUID}/dismiss`)
        .expect(204);
    });

    it('returns 403 for super_admin role', async () => {
      await request(superAdminApp.getHttpServer() as import('http').Server)
        .post(`/admin/notifications/${VALID_UUID}/dismiss`)
        .expect(403);
    });
  });
});
