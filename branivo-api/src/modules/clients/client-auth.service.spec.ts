import {
  ConflictException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { ClientAuthService } from './client-auth.service';
import { EndClient } from './entities/end-client.entity';
import { EndClientRepository } from './repositories/end-client.repository';
import { SmsService } from './sms.service';

// Mock google-auth-library before importing the service
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}));
import { OAuth2Client } from 'google-auth-library';

const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
  setex: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  set: jest.fn(),
};

const mockEndClientRepo = {
  findOrCreate: jest.fn(),
  markPhoneVerified: jest.fn(),
  findByGoogleSub: jest.fn(),
  findByEmail: jest.fn(),
  mergeGoogleAccount: jest.fn(),
  createGoogleClient: jest.fn(),
  findByPhone: jest.fn(),
  updatePhone: jest.fn(),
};

const mockSmsService = {
  sendOtp: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
};

const mockConfig = {
  getOrThrow: jest.fn().mockImplementation((key: string) => {
    if (key === 'GOOGLE_CLIENT_ID') return 'google-client-id-test';
    return 'test-secret';
  }),
  get: jest.fn().mockReturnValue('test'),
};

const TENANT_ID = 'tenant-uuid-123';
const PHONE = '+35988123456';
const OTP = '123456';

describe('ClientAuthService', () => {
  let service: ClientAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ClientAuthService(
      mockRedis as unknown as Redis,
      mockEndClientRepo as unknown as EndClientRepository,
      mockSmsService as unknown as SmsService,
      mockJwtService as unknown as JwtService,
      mockConfig as unknown as ConfigService,
    );
  });

  describe('requestOtp', () => {
    it('should send OTP and store Redis key with TTL 300', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.setex.mockResolvedValue('OK');
      mockSmsService.sendOtp.mockResolvedValue(undefined);

      const result = await service.requestOtp(PHONE, TENANT_ID);

      expect(result).toEqual({ expires_in: 300 });
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `client_otp:${TENANT_ID}:${PHONE}`,
        300,
        expect.stringMatching(/^\d{6}$/),
      );
      expect(mockSmsService.sendOtp).toHaveBeenCalledWith(
        PHONE,
        expect.stringMatching(/^\d{6}$/),
      );
    });

    it('should throw TooManyRequestsException when 3+ requests per hour', async () => {
      mockRedis.incr.mockResolvedValue(4); // already > 3

      let thrown: unknown;
      try {
        await service.requestOtp(PHONE, TENANT_ID);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(HttpException);
      expect((thrown as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect((thrown as HttpException).getResponse()).toMatchObject({
        retry_after: 3600,
      });
      expect(mockSmsService.sendOtp).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    const makeClient = (overrides: Partial<EndClient> = {}): EndClient =>
      Object.assign(new EndClient(), {
        id: 'client-uuid',
        tenantId: TENANT_ID,
        phoneNumber: PHONE,
        phoneVerified: false,
        firstName: null,
        lastName: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides,
      });

    beforeEach(() => {
      mockRedis.get.mockReset();
      mockRedis.incr.mockReset();
      mockRedis.expire.mockReset();
      mockRedis.del.mockReset();
    });

    it('should return EndClient when OTP is correct', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('client_otp_attempts')) return Promise.resolve(null);
        if (key.startsWith('client_otp:')) return Promise.resolve(OTP);
        return Promise.resolve(null);
      });
      mockRedis.del.mockResolvedValue(1);
      const client = makeClient();
      mockEndClientRepo.findOrCreate.mockResolvedValue({ client, isNew: true });
      mockEndClientRepo.markPhoneVerified.mockResolvedValue(undefined);

      const result = await service.verifyOtp(PHONE, OTP, TENANT_ID);

      expect(result).toEqual({ client, isNew: true });
      expect(mockRedis.del).toHaveBeenCalledWith(
        `client_otp:${TENANT_ID}:${PHONE}`,
      );
      expect(mockEndClientRepo.markPhoneVerified).toHaveBeenCalledWith(
        client.id,
      );
    });

    it('should throw UnprocessableEntityException when OTP is expired (Redis miss)', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.verifyOtp(PHONE, OTP, TENANT_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should increment attempts counter and throw UnauthorizedException when OTP is wrong', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('client_otp_attempts')) return Promise.resolve(null);
        if (key.startsWith('client_otp:')) return Promise.resolve('999999');
        return Promise.resolve(null);
      });
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      await expect(service.verifyOtp(PHONE, OTP, TENANT_ID)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRedis.incr).toHaveBeenCalledWith(
        `client_otp_attempts:${TENANT_ID}:${PHONE}`,
      );
    });

    it('should throw TooManyRequestsException after 3 wrong attempts', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('client_otp_attempts')) return Promise.resolve('3');
        return Promise.resolve(OTP);
      });

      let thrown: unknown;
      try {
        await service.verifyOtp(PHONE, OTP, TENANT_ID);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(HttpException);
      expect((thrown as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect((thrown as HttpException).getResponse()).toMatchObject({
        retry_after: 3600,
      });
    });

    it('should authenticate existing account without creating duplicate', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('client_otp_attempts')) return Promise.resolve(null);
        if (key.startsWith('client_otp:')) return Promise.resolve(OTP);
        return Promise.resolve(null);
      });
      mockRedis.del.mockResolvedValue(1);
      const existing = makeClient({ phoneVerified: true });
      mockEndClientRepo.findOrCreate.mockResolvedValue({
        client: existing,
        isNew: false,
      });
      mockEndClientRepo.markPhoneVerified.mockResolvedValue(undefined);

      const result = await service.verifyOtp(PHONE, OTP, TENANT_ID);

      expect(result).toEqual({ client: existing, isNew: false });
      // findOrCreate called once — no duplicates
      expect(mockEndClientRepo.findOrCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('googleAuth', () => {
    const GOOGLE_SUB = 'google-sub-12345';
    const GOOGLE_EMAIL = 'ivan@gmail.com';
    const ID_TOKEN = 'mock-google-id-token';

    const makeClient = (overrides: Partial<EndClient> = {}): EndClient =>
      Object.assign(new EndClient(), {
        id: 'client-uuid',
        tenantId: TENANT_ID,
        phoneNumber: null,
        phoneVerified: false,
        authProvider: 'google',
        googleSub: GOOGLE_SUB,
        appleSub: null,
        firstName: 'Иван',
        lastName: 'Иванов',
        email: GOOGLE_EMAIL,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides,
      });

    const setupMockVerifyIdToken = (
      overrides: {
        sub?: string;
        email?: string;
        given_name?: string;
        family_name?: string;
      } = {},
    ) => {
      const MockOAuth2Client = OAuth2Client as jest.MockedClass<
        typeof OAuth2Client
      >;
      const mockInstance = {
        verifyIdToken: jest.fn().mockResolvedValue({
          getPayload: () => ({
            sub: overrides.sub ?? GOOGLE_SUB,
            email: overrides.email ?? GOOGLE_EMAIL,
            given_name: overrides.given_name ?? 'Иван',
            family_name: overrides.family_name ?? 'Иванов',
          }),
        }),
      };
      MockOAuth2Client.mockImplementation(
        () => mockInstance as unknown as OAuth2Client,
      );
      return mockInstance;
    };

    beforeEach(() => {
      jest.clearAllMocks();
      service = new ClientAuthService(
        mockRedis as unknown as Redis,
        mockEndClientRepo as unknown as EndClientRepository,
        mockSmsService as unknown as SmsService,
        mockJwtService as unknown as JwtService,
        mockConfig as unknown as ConfigService,
      );
    });

    it('should login existing Google customer (by google_sub)', async () => {
      setupMockVerifyIdToken();
      const client = makeClient();
      mockEndClientRepo.findByGoogleSub.mockResolvedValue(client);

      const result = await service.googleAuth(
        { id_token: ID_TOKEN },
        TENANT_ID,
      );

      expect(result).toEqual({ client, isNew: false, accountMerged: false });
      expect(mockEndClientRepo.findByGoogleSub).toHaveBeenCalledWith(
        TENANT_ID,
        GOOGLE_SUB,
      );
      expect(mockEndClientRepo.createGoogleClient).not.toHaveBeenCalled();
    });

    it('should create new Google customer when not found', async () => {
      setupMockVerifyIdToken();
      const newClient = makeClient({ id: 'new-client-uuid' });
      mockEndClientRepo.findByGoogleSub.mockResolvedValue(null);
      mockEndClientRepo.findByEmail.mockResolvedValue(null);
      mockEndClientRepo.createGoogleClient.mockResolvedValue(newClient);

      const result = await service.googleAuth(
        { id_token: ID_TOKEN },
        TENANT_ID,
      );

      expect(result).toEqual({
        client: newClient,
        isNew: true,
        accountMerged: false,
      });
      expect(mockEndClientRepo.createGoogleClient).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        googleSub: GOOGLE_SUB,
        email: GOOGLE_EMAIL,
        firstName: 'Иван',
        lastName: 'Иванов',
      });
    });

    it('should auto-merge SMS customer with same email', async () => {
      setupMockVerifyIdToken();
      const smsClient = makeClient({
        authProvider: 'sms',
        googleSub: null,
        phoneNumber: '+35988123456',
        phoneVerified: true,
      });
      mockEndClientRepo.findByGoogleSub.mockResolvedValue(null);
      mockEndClientRepo.findByEmail.mockResolvedValue(smsClient);
      mockEndClientRepo.mergeGoogleAccount.mockResolvedValue(undefined);

      const result = await service.googleAuth(
        { id_token: ID_TOKEN },
        TENANT_ID,
      );

      expect(result.accountMerged).toBe(true);
      expect(result.isNew).toBe(false);
      expect(result.client.googleSub).toBe(GOOGLE_SUB);
      expect(mockEndClientRepo.mergeGoogleAccount).toHaveBeenCalledWith(
        smsClient.id,
        GOOGLE_SUB,
      );
    });

    it('should throw UnauthorizedException for invalid Google token', async () => {
      const MockOAuth2Client = OAuth2Client as jest.MockedClass<
        typeof OAuth2Client
      >;
      MockOAuth2Client.mockImplementation(
        () =>
          ({
            verifyIdToken: jest
              .fn()
              .mockRejectedValue(new Error('Invalid token')),
          }) as unknown as OAuth2Client,
      );
      service = new ClientAuthService(
        mockRedis as unknown as Redis,
        mockEndClientRepo as unknown as EndClientRepository,
        mockSmsService as unknown as SmsService,
        mockJwtService as unknown as JwtService,
        mockConfig as unknown as ConfigService,
      );

      await expect(
        service.googleAuth({ id_token: 'bad-token' }, TENANT_ID),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when payload is null', async () => {
      const MockOAuth2Client = OAuth2Client as jest.MockedClass<
        typeof OAuth2Client
      >;
      MockOAuth2Client.mockImplementation(
        () =>
          ({
            verifyIdToken: jest.fn().mockResolvedValue({
              getPayload: () => null,
            }),
          }) as unknown as OAuth2Client,
      );
      service = new ClientAuthService(
        mockRedis as unknown as Redis,
        mockEndClientRepo as unknown as EndClientRepository,
        mockSmsService as unknown as SmsService,
        mockJwtService as unknown as JwtService,
        mockConfig as unknown as ConfigService,
      );

      await expect(
        service.googleAuth({ id_token: ID_TOKEN }, TENANT_ID),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyPhoneOtp', () => {
    const CLIENT_ID = 'client-uuid';

    it('should update phone and mark verified when OTP is correct', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('client_otp_attempts')) return Promise.resolve(null);
        if (key.startsWith('client_otp:')) return Promise.resolve(OTP);
        return Promise.resolve(null);
      });
      mockRedis.del.mockResolvedValue(1);
      mockEndClientRepo.findByPhone.mockResolvedValue(null);
      mockEndClientRepo.updatePhone.mockResolvedValue(undefined);

      await service.verifyPhoneOtp(CLIENT_ID, PHONE, OTP, TENANT_ID);

      expect(mockEndClientRepo.updatePhone).toHaveBeenCalledWith(
        CLIENT_ID,
        PHONE,
      );
    });

    it('should throw ConflictException when phone belongs to another account', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('client_otp_attempts')) return Promise.resolve(null);
        if (key.startsWith('client_otp:')) return Promise.resolve(OTP);
        return Promise.resolve(null);
      });
      mockRedis.del.mockResolvedValue(1);
      const otherClient = Object.assign(new EndClient(), {
        id: 'other-client-uuid',
        tenantId: TENANT_ID,
      });
      mockEndClientRepo.findByPhone.mockResolvedValue(otherClient);

      await expect(
        service.verifyPhoneOtp(CLIENT_ID, PHONE, OTP, TENANT_ID),
      ).rejects.toThrow(ConflictException);
    });
  });
});
