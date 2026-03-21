import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

describe('AuthController (integration)', () => {
  let app: INestApplication;

  const authServiceMock = {
    login: jest.fn(),
    verify2FA: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };

  const mockUser = {
    userId: 'user-uuid',
    tenantId: 'tenant-uuid',
    role: 'broker_admin',
    jti: 'jti-uuid',
    exp: Math.floor(Date.now() / 1000) + 900,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authServiceMock }],
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
          req.user = mockUser;
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

  describe('POST /auth/login', () => {
    it('returns 200 with tokens on valid credentials', async () => {
      authServiceMock.login.mockResolvedValue({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 900,
      });

      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/auth/login')
        .send({ email: 'broker@example.com', password: 'Password1!' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ access_token: 'at', expires_in: 900 });
    });

    it('returns 200 with requires_2fa on 2FA-enabled account', async () => {
      authServiceMock.login.mockResolvedValue({
        requires_2fa: true,
        temp_token: 'temp',
      });

      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/auth/login')
        .send({ email: 'broker@example.com', password: 'Password1!' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        requires_2fa: true,
        temp_token: 'temp',
      });
    });

    it('returns 400 for invalid email format', async () => {
      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'pass' });

      expect(res.status).toBe(400);
    });

    it('response NEVER contains password_hash or two_fa_secret_enc', async () => {
      authServiceMock.login.mockResolvedValue({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 900,
      });

      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/auth/login')
        .send({ email: 'broker@example.com', password: 'Password1!' });

      expect(res.body).not.toHaveProperty('password_hash');
      expect(res.body).not.toHaveProperty('two_fa_secret_enc');
    });
  });

  describe('POST /auth/2fa/verify', () => {
    it('returns 200 with tokens on valid TOTP', async () => {
      authServiceMock.verify2FA.mockResolvedValue({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 900,
      });

      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/auth/2fa/verify')
        .send({ temp_token: 'temp', otp_code: '123456' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ access_token: 'at' });
    });

    it('returns 400 for non-numeric otp_code', async () => {
      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/auth/2fa/verify')
        .send({ temp_token: 'temp', otp_code: 'abcdef' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for wrong otp_code length', async () => {
      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/auth/2fa/verify')
        .send({ temp_token: 'temp', otp_code: '123' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns 200 with new tokens', async () => {
      authServiceMock.refresh.mockResolvedValue({
        access_token: 'new-at',
        refresh_token: 'new-rt',
        expires_in: 900,
      });

      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/auth/refresh')
        .send({ refresh_token: 'rt' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ access_token: 'new-at' });
    });
  });

  describe('POST /auth/logout', () => {
    it('returns 200 with message', async () => {
      authServiceMock.logout.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ message: 'Logged out successfully' });
    });
  });
});
