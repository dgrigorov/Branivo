import {
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
};

const mockSmsService = {
  sendOtp: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
};

const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('test-secret'),
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
});
