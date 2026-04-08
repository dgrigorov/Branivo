import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { AnonymousSessionsService } from '../sessions/anonymous-sessions.service';
import { EndClient } from './entities/end-client.entity';

const TENANT_ID = 'tenant-uuid-123';
const PHONE = '+35988123456';
const ACCESS_TOKEN = 'access-jwt';
const REFRESH_TOKEN = 'refresh-jwt';

const mockClientAuthService = {
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
  generateTokens: jest.fn(),
  googleAuth: jest.fn(),
  requestPhoneOtp: jest.fn(),
  verifyPhoneOtp: jest.fn(),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

const mockAnonymousSessionsService = {
  migrateSession: jest.fn(),
};

const mockResponse = {
  cookie: jest.fn(),
};

const makeClient = (overrides: Partial<EndClient> = {}): EndClient =>
  Object.assign(new EndClient(), {
    id: 'client-uuid',
    tenantId: TENANT_ID,
    phoneNumber: PHONE,
    phoneVerified: false,
    authProvider: 'sms',
    googleSub: null,
    appleSub: null,
    firstName: null,
    lastName: null,
    email: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

describe('ClientAuthController', () => {
  let controller: ClientAuthController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientAuthController],
      providers: [
        { provide: ClientAuthService, useValue: mockClientAuthService },
        { provide: TenantContext, useValue: mockTenantContext },
        {
          provide: AnonymousSessionsService,
          useValue: mockAnonymousSessionsService,
        },
      ],
    }).compile();

    controller = module.get<ClientAuthController>(ClientAuthController);
  });

  describe('POST /auth/client/request-otp', () => {
    it('should return 200 with { message, expires_in }', async () => {
      mockClientAuthService.requestOtp.mockResolvedValue({ expires_in: 300 });

      const result = await controller.requestOtp({ phone_number: PHONE });

      expect(result).toEqual({ message: 'OTP изпратен', expires_in: 300 });
      expect(mockClientAuthService.requestOtp).toHaveBeenCalledWith(
        PHONE,
        TENANT_ID,
      );
    });

    it('should propagate 429 TooManyRequests from service', async () => {
      mockClientAuthService.requestOtp.mockRejectedValue(
        new HttpException(
          { message: 'Твърде много опити', retry_after: 3600 },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      await expect(
        controller.requestOtp({ phone_number: PHONE }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('POST /auth/client/verify-otp', () => {
    it('should return 200 with access_token and no refresh_token in body', async () => {
      const client = makeClient();
      mockClientAuthService.verifyOtp.mockResolvedValue({
        client,
        isNew: true,
      });
      mockClientAuthService.generateTokens.mockResolvedValue({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
      });

      const result = await controller.verifyOtp(
        { phone_number: PHONE, otp_code: '123456' },
        mockResponse as unknown as import('express').Response,
      );

      expect(result.access_token).toBe(ACCESS_TOKEN);
      expect(result.user.id).toBe('client-uuid');
      expect(result.user.is_new).toBe(true);
      expect((result as Record<string, unknown>).refresh_token).toBeUndefined();
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refresh_token',
        REFRESH_TOKEN,
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('should throw 422 when OTP is expired (propagated from service)', async () => {
      mockClientAuthService.verifyOtp.mockRejectedValue(
        new HttpException(
          { message: 'Кодът е изтекъл. Поискайте нов код.' },
          HttpStatus.UNPROCESSABLE_ENTITY,
        ),
      );

      await expect(
        controller.verifyOtp(
          { phone_number: PHONE, otp_code: '000000' },
          mockResponse as unknown as import('express').Response,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should call migrateSession when session_id is provided (verifyOtp)', async () => {
      const client = makeClient();
      mockClientAuthService.verifyOtp.mockResolvedValue({
        client,
        isNew: false,
      });
      mockClientAuthService.generateTokens.mockResolvedValue({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
      });
      mockAnonymousSessionsService.migrateSession.mockResolvedValue({});

      await controller.verifyOtp(
        { phone_number: PHONE, otp_code: '123456', session_id: 'session-uuid' },
        mockResponse as unknown as import('express').Response,
      );

      expect(mockAnonymousSessionsService.migrateSession).toHaveBeenCalledWith(
        'session-uuid',
        TENANT_ID,
        'client-uuid',
      );
    });
  });

  describe('POST /auth/client/google', () => {
    const GOOGLE_CLIENT = makeClient({
      phoneNumber: null,
      phoneVerified: false,
      authProvider: 'google',
      googleSub: 'google-sub-123',
      email: 'ivan@gmail.com',
    });

    it('should return 200 with access_token and user info for new Google customer', async () => {
      mockClientAuthService.googleAuth.mockResolvedValue({
        client: GOOGLE_CLIENT,
        isNew: true,
        accountMerged: false,
      });
      mockClientAuthService.generateTokens.mockResolvedValue({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
      });

      const result = await controller.googleAuth(
        { id_token: 'google-id-token' },
        mockResponse as unknown as import('express').Response,
      );

      expect(result.access_token).toBe(ACCESS_TOKEN);
      expect(result.user.is_new).toBe(true);
      expect(result.user.account_merged).toBe(false);
      expect(result.user.phone_verified).toBe(false);
      expect(result.user.phone_number).toBeNull();
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refresh_token',
        REFRESH_TOKEN,
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('should return account_merged true on SMS account merge', async () => {
      const mergedClient = makeClient({
        authProvider: 'google',
        googleSub: 'google-sub-123',
        phoneNumber: PHONE,
        phoneVerified: true,
      });
      mockClientAuthService.googleAuth.mockResolvedValue({
        client: mergedClient,
        isNew: false,
        accountMerged: true,
      });
      mockClientAuthService.generateTokens.mockResolvedValue({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
      });

      const result = await controller.googleAuth(
        { id_token: 'google-id-token' },
        mockResponse as unknown as import('express').Response,
      );

      expect(result.user.account_merged).toBe(true);
      expect(result.user.phone_verified).toBe(true);
    });

    it('should return 200 for returning Google customer (login)', async () => {
      const existingClient = makeClient({
        authProvider: 'google',
        googleSub: 'google-sub-123',
        phoneNumber: null,
        phoneVerified: false,
      });
      mockClientAuthService.googleAuth.mockResolvedValue({
        client: existingClient,
        isNew: false,
        accountMerged: false,
      });
      mockClientAuthService.generateTokens.mockResolvedValue({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
      });

      const result = await controller.googleAuth(
        { id_token: 'google-id-token' },
        mockResponse as unknown as import('express').Response,
      );

      expect(result.user.is_new).toBe(false);
      expect(result.user.account_merged).toBe(false);
    });

    it('should propagate 401 UnauthorizedException for invalid token', async () => {
      mockClientAuthService.googleAuth.mockRejectedValue(
        new HttpException(
          { message: 'Invalid Google token' },
          HttpStatus.UNAUTHORIZED,
        ),
      );

      await expect(
        controller.googleAuth(
          { id_token: 'bad-token' },
          mockResponse as unknown as import('express').Response,
        ),
      ).rejects.toThrow(HttpException);
    });
  });
});
