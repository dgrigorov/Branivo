/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  ConflictException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { User } from './entities/user.entity';

const OTHER_USER_UUID = '11111111-1111-1111-1111-111111111111';

const mockUser: User = {
  id: OTHER_USER_UUID,
  tenantId: 'tenant-uuid',
  email: 'agent@example.com',
  passwordHash: 'hashed',
  role: 'broker_agent',
  twoFaEnabled: false,
  twoFaSecretEnc: null,
  failedLoginCount: 0,
  lockedUntil: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

const mockUsersService = {
  findAll: jest.fn().mockResolvedValue([mockUser]),
  createBrokerUser: jest.fn().mockResolvedValue(mockUser),
  updateRole: jest.fn().mockResolvedValue(undefined),
  softDeleteUser: jest.fn().mockResolvedValue(undefined),
  findByEmailAndTenant: jest.fn(),
};

const ADMIN_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AGENT_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const brokerAdminUser = {
  userId: ADMIN_UUID,
  tenantId: 'tenant-uuid',
  role: 'broker_admin',
  jti: 'jti-uuid',
  exp: Math.floor(Date.now() / 1000) + 900,
};

const brokerAgentUser = {
  userId: AGENT_UUID,
  tenantId: 'tenant-uuid',
  role: 'broker_agent',
  jti: 'jti-uuid2',
  exp: Math.floor(Date.now() / 1000) + 900,
};

function makeJwtGuard(user: typeof brokerAdminUser | null) {
  return {
    canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
      if (!user) {
        throw new (jest.requireActual<typeof import('@nestjs/common')>(
          '@nestjs/common',
        ).UnauthorizedException)();
      }
      const req = ctx
        .switchToHttp()
        .getRequest<{ user: typeof brokerAdminUser }>();
      req.user = user;
      return true;
    },
  };
}

describe('UsersController', () => {
  let app: INestApplication;

  async function buildApp(authUser: typeof brokerAdminUser | null) {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(makeJwtGuard(authUser))
      .overrideGuard(RolesGuard)
      .useClass(RolesGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  }

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /users', () => {
    it('returns 401 when no auth', async () => {
      await buildApp(null);
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('returns 403 for broker_agent role', async () => {
      await buildApp(brokerAgentUser);
      await request(app.getHttpServer()).get('/users').expect(403);
    });

    it('returns 200 with user list for broker_admin', async () => {
      await buildApp(brokerAdminUser);
      const res = await request(app.getHttpServer()).get('/users').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty('id', OTHER_USER_UUID);
      expect(res.body[0]).toHaveProperty('email', 'agent@example.com');
    });

    it('response does NOT contain passwordHash or twoFaSecretEnc', async () => {
      await buildApp(brokerAdminUser);
      const res = await request(app.getHttpServer()).get('/users').expect(200);

      expect(res.body[0]).not.toHaveProperty('passwordHash');
      expect(res.body[0]).not.toHaveProperty('twoFaSecretEnc');
      expect(res.body[0]).not.toHaveProperty('failedLoginCount');
      expect(res.body[0]).not.toHaveProperty('lockedUntil');
    });
  });

  describe('POST /users', () => {
    const validBody = {
      email: 'new@example.com',
      role: 'broker_agent',
      password: 'ValidPass1!',
    };

    it('returns 403 for broker_agent role', async () => {
      await buildApp(brokerAgentUser);
      await request(app.getHttpServer())
        .post('/users')
        .send(validBody)
        .expect(403);
    });

    it('returns 201 for broker_admin with valid data', async () => {
      await buildApp(brokerAdminUser);
      mockUsersService.createBrokerUser.mockResolvedValueOnce(mockUser);

      const res = await request(app.getHttpServer())
        .post('/users')
        .send(validBody)
        .expect(201);

      expect(res.body).toHaveProperty('email');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('returns 400 for invalid email', async () => {
      await buildApp(brokerAdminUser);
      await request(app.getHttpServer())
        .post('/users')
        .send({ ...validBody, email: 'not-an-email' })
        .expect(400);
    });

    it('returns 400 for weak password (no uppercase)', async () => {
      await buildApp(brokerAdminUser);
      await request(app.getHttpServer())
        .post('/users')
        .send({ ...validBody, password: 'weakpassword1!' })
        .expect(400);
    });

    it('returns 409 when service throws ConflictException (duplicate email)', async () => {
      await buildApp(brokerAdminUser);
      mockUsersService.createBrokerUser.mockRejectedValueOnce(
        new ConflictException(
          'A user with this email already exists in this tenant',
        ),
      );

      await request(app.getHttpServer())
        .post('/users')
        .send(validBody)
        .expect(409);
    });
  });

  describe('PUT /users/:id/role', () => {
    it('returns 403 for broker_agent role', async () => {
      await buildApp(brokerAgentUser);
      await request(app.getHttpServer())
        .put('/users/user-uuid/role')
        .send({ role: 'broker_viewer' })
        .expect(403);
    });

    it('returns 200 for broker_admin with valid role', async () => {
      await buildApp(brokerAdminUser);
      await request(app.getHttpServer())
        .put(`/users/${OTHER_USER_UUID}/role`)
        .send({ role: 'broker_viewer' })
        .expect(200);

      expect(mockUsersService.updateRole).toHaveBeenCalledWith(
        OTHER_USER_UUID,
        'broker_viewer',
      );
    });

    it('returns 400 when super_admin role is in body (fails IsIn validation)', async () => {
      await buildApp(brokerAdminUser);
      await request(app.getHttpServer())
        .put(`/users/${OTHER_USER_UUID}/role`)
        .send({ role: 'super_admin' })
        .expect(400);
    });

    it('returns 400 when admin tries to change own role', async () => {
      await buildApp(brokerAdminUser);
      await request(app.getHttpServer())
        .put(`/users/${ADMIN_UUID}/role`)
        .send({ role: 'broker_viewer' })
        .expect(400);
    });

    it('returns 400 when :id is not a valid UUID', async () => {
      await buildApp(brokerAdminUser);
      await request(app.getHttpServer())
        .put('/users/not-a-uuid/role')
        .send({ role: 'broker_viewer' })
        .expect(400);
    });
  });

  describe('DELETE /users/:id', () => {
    it('returns 403 for broker_agent', async () => {
      await buildApp(brokerAgentUser);
      await request(app.getHttpServer())
        .delete(`/users/${OTHER_USER_UUID}`)
        .expect(403);
    });

    it('returns 200 for broker_admin', async () => {
      await buildApp(brokerAdminUser);
      await request(app.getHttpServer())
        .delete(`/users/${OTHER_USER_UUID}`)
        .expect(200);

      expect(mockUsersService.softDeleteUser).toHaveBeenCalledWith(
        OTHER_USER_UUID,
      );
    });

    it('returns 400 when admin tries to delete own account', async () => {
      await buildApp(brokerAdminUser);
      await request(app.getHttpServer())
        .delete(`/users/${ADMIN_UUID}`)
        .expect(400);
    });

    it('returns 400 when :id is not a valid UUID', async () => {
      await buildApp(brokerAdminUser);
      await request(app.getHttpServer())
        .delete('/users/not-a-uuid')
        .expect(400);
    });
  });

  describe('GET /users/me', () => {
    it('returns current user info for any authenticated user', async () => {
      await buildApp(brokerAdminUser);
      const res = await request(app.getHttpServer())
        .get('/users/me')
        .expect(200);

      expect(res.body).toEqual({
        userId: ADMIN_UUID,
        tenantId: 'tenant-uuid',
        role: 'broker_admin',
      });
    });
  });
});
