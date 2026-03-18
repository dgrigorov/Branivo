/* eslint-disable @typescript-eslint/unbound-method */
import {
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { CryptoService } from '../../common/crypto/crypto.service';
import { UsersRepository } from '../users/users.repository';
import { TenantsRepository } from '../tenants/tenants.repository';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { verifySync } from 'otplib';

jest.mock('bcrypt');
jest.mock('otplib', () => ({
  verifySync: jest.fn(),
}));

const mockUser: User = {
  id: 'user-uuid',
  tenantId: 'tenant-uuid',
  email: 'broker@example.com',
  passwordHash: '$2b$12$hashedpassword',
  role: 'broker_admin',
  twoFaEnabled: false,
  twoFaSecretEnc: null,
  failedLoginCount: 0,
  lockedUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let usersRepo: jest.Mocked<UsersRepository>;
  let tenantsRepo: jest.Mocked<TenantsRepository>;
  let cryptoService: jest.Mocked<CryptoService>;
  let redisMock: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    exists: jest.Mock;
  };

  beforeEach(async () => {
    redisMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('signed-token'),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('test-secret') },
        },
        {
          provide: UsersRepository,
          useValue: {
            findByEmailAndTenant: jest.fn(),
            findByIdAndTenant: jest.fn(),
            incrementAndMaybeLock: jest.fn(),
            resetFailedLoginCount: jest.fn(),
          },
        },
        {
          provide: TenantsRepository,
          useValue: { findTenantIdByHostname: jest.fn() },
        },
        {
          provide: CryptoService,
          useValue: { decrypt: jest.fn() },
        },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get(AuthService);
    jwtService = module.get(JwtService);
    usersRepo = module.get(UsersRepository);
    tenantsRepo = module.get(TenantsRepository);
    cryptoService = module.get(CryptoService);
  });

  describe('login', () => {
    beforeEach(() => {
      redisMock.get.mockResolvedValue('tenant-uuid');
      redisMock.set.mockResolvedValue('OK');
      usersRepo.findByEmailAndTenant.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      usersRepo.resetFailedLoginCount.mockResolvedValue(undefined);
    });

    it('returns tokens on valid credentials without 2FA', async () => {
      const result = await service.login(
        'broker1.branivo.bg',
        'broker@example.com',
        'password',
      );

      expect(result).toMatchObject({
        access_token: 'signed-token',
        refresh_token: 'signed-token',
        expires_in: 900,
      });
      expect(usersRepo.resetFailedLoginCount).toHaveBeenCalledWith('user-uuid');
    });

    it('returns requires_2fa + temp_token when 2FA is enabled', async () => {
      usersRepo.findByEmailAndTenant.mockResolvedValue({
        ...mockUser,
        twoFaEnabled: true,
        twoFaSecretEnc: 'encrypted-secret',
      });

      const result = await service.login(
        'broker1.branivo.bg',
        'broker@example.com',
        'password',
      );

      expect(result).toMatchObject({
        requires_2fa: true,
        temp_token: 'signed-token',
      });
    });

    it('throws 401 with generic message on invalid password (no hint which field)', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      usersRepo.incrementAndMaybeLock.mockResolvedValue({
        failedLoginCount: 1,
        lockedUntil: null,
      });

      await expect(
        service.login('broker1.branivo.bg', 'broker@example.com', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws 401 when user not found (no hint that email is wrong)', async () => {
      usersRepo.findByEmailAndTenant.mockResolvedValue(null);

      await expect(
        service.login('broker1.branivo.bg', 'nobody@example.com', 'pass'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws 429 for locked account', async () => {
      usersRepo.findByEmailAndTenant.mockResolvedValue({
        ...mockUser,
        lockedUntil: new Date(Date.now() + 900_000),
      });

      const err = await service
        .login('broker1.branivo.bg', 'broker@example.com', 'password')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    });

    it('throws 429 and locks account after 5 failed attempts (atomic)', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      usersRepo.incrementAndMaybeLock.mockResolvedValue({
        failedLoginCount: 5,
        lockedUntil: new Date(Date.now() + 900_000),
      });

      const err = await service
        .login('broker1.branivo.bg', 'broker@example.com', 'wrong')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(usersRepo.incrementAndMaybeLock).toHaveBeenCalledWith(
        'user-uuid',
        5,
        900,
      );
    });

    it('throws NotFoundException when host resolves to unknown tenant', async () => {
      redisMock.get.mockResolvedValue(null);
      tenantsRepo.findTenantIdByHostname.mockResolvedValue(null);

      await expect(
        service.login('unknown.example.com', 'broker@example.com', 'password'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verify2FA', () => {
    it('returns tokens on valid TOTP code', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid',
        tid: 'tenant-uuid',
        type: 'temp_2fa',
      });
      usersRepo.findByIdAndTenant.mockResolvedValue({
        ...mockUser,
        twoFaEnabled: true,
        twoFaSecretEnc: 'encrypted-secret',
      });
      cryptoService.decrypt.mockReturnValue('BASE32SECRET');
      (verifySync as jest.Mock).mockReturnValue({ valid: true });

      const result = await service.verify2FA('temp-token', '123456');

      expect(result).toMatchObject({
        access_token: 'signed-token',
        expires_in: 900,
      });
    });

    it('throws 401 on invalid TOTP code', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid',
        tid: 'tenant-uuid',
        type: 'temp_2fa',
      });
      usersRepo.findByIdAndTenant.mockResolvedValue({
        ...mockUser,
        twoFaEnabled: true,
        twoFaSecretEnc: 'encrypted-secret',
      });
      cryptoService.decrypt.mockReturnValue('BASE32SECRET');
      (verifySync as jest.Mock).mockReturnValue({ valid: false });

      await expect(service.verify2FA('temp-token', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 on invalid or expired temp_token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.verify2FA('bad-token', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('issues new tokens and rotates refresh token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid',
        tid: 'tenant-uuid',
        jti: 'refresh-jti',
        type: 'refresh',
      });
      redisMock.get.mockResolvedValue('user-uuid');
      redisMock.del.mockResolvedValue(1);
      usersRepo.findByIdAndTenant.mockResolvedValue(mockUser);

      const result = await service.refresh('refresh-token');

      expect(redisMock.del).toHaveBeenCalled();
      expect(result).toMatchObject({
        access_token: 'signed-token',
        expires_in: 900,
      });
    });

    it('throws 401 fail-secure when Redis is unavailable', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid',
        tid: 'tenant-uuid',
        jti: 'refresh-jti',
        type: 'refresh',
      });
      redisMock.get.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.refresh('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws 401 for revoked refresh token not in Redis', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid',
        tid: 'tenant-uuid',
        jti: 'revoked-jti',
        type: 'refresh',
      });
      redisMock.get.mockResolvedValue(null);

      await expect(service.refresh('revoked-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('blacklists JTI with remaining TTL', async () => {
      redisMock.set.mockResolvedValue('OK');
      const futureExp = Math.floor(Date.now() / 1000) + 500;

      await service.logout('jti-uuid', 'tenant-uuid', futureExp);

      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining('blacklist:jti-uuid'),
        '1',
        'EX',
        expect.any(Number),
      );
    });

    it('does nothing when token is already expired', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 100;

      await service.logout('jti-uuid', 'tenant-uuid', pastExp);

      expect(redisMock.set).not.toHaveBeenCalled();
    });
  });
});
