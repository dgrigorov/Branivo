/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
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
import { EmailService } from '../../infrastructure/email/email.service';
import { PasswordResetTokensRepository } from './password-reset-tokens.repository';
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
  let emailService: jest.Mocked<EmailService>;
  let passwordResetTokensRepo: jest.Mocked<PasswordResetTokensRepository>;
  let redisMock: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    exists: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
    scan: jest.Mock;
    mget: jest.Mock;
  };

  beforeEach(async () => {
    redisMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      scan: jest.fn().mockResolvedValue(['0', []]),
      mget: jest.fn().mockResolvedValue([]),
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
            findById: jest.fn(),
            findByEmailPlatformWide: jest.fn(),
            findByPhonePlatformWide: jest.fn(),
            updatePassword: jest.fn(),
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
        {
          provide: EmailService,
          useValue: {
            sendPasswordResetEmail: jest.fn(),
            sendPasswordResetOtp: jest.fn(),
          },
        },
        {
          provide: PasswordResetTokensRepository,
          useValue: {
            create: jest.fn(),
            findByTokenHash: jest.fn(),
            markUsed: jest.fn(),
            markAllUsedForUser: jest.fn(),
            deleteExpiredForUser: jest.fn(),
          },
        },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get(AuthService);
    jwtService = module.get(JwtService);
    usersRepo = module.get(UsersRepository);
    tenantsRepo = module.get(TenantsRepository);
    cryptoService = module.get(CryptoService);
    emailService = module.get(EmailService);
    passwordResetTokensRepo = module.get(PasswordResetTokensRepository);
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

    it('AC3: uses current role from DB, not role from old refresh token payload', async () => {
      // Simulate role change: user was broker_admin when refresh token was issued,
      // but is now broker_viewer in DB — new access token must reflect DB state
      const userWithUpdatedRole = {
        ...mockUser,
        role: 'broker_viewer' as const,
      };
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid',
        tid: 'tenant-uuid',
        jti: 'refresh-jti',
        type: 'refresh',
      });
      redisMock.get.mockResolvedValue('user-uuid');
      redisMock.del.mockResolvedValue(1);
      usersRepo.findByIdAndTenant.mockResolvedValue(userWithUpdatedRole);

      await service.refresh('refresh-token');

      // issueTokens is called with user.role from DB (broker_viewer), not from JWT payload
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'broker_viewer' }),
        expect.any(Object),
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

  describe('requestPasswordReset', () => {
    beforeEach(() => {
      redisMock.incr.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);
      emailService.sendPasswordResetEmail.mockResolvedValue(undefined);
      passwordResetTokensRepo.create.mockResolvedValue(undefined);
      passwordResetTokensRepo.deleteExpiredForUser.mockResolvedValue(undefined);
    });

    it('returns silently for non-existent email (anti-enumeration)', async () => {
      usersRepo.findByEmailPlatformWide.mockResolvedValue(null);

      await expect(
        service.requestPasswordReset('nobody@example.com'),
      ).resolves.toBeUndefined();

      expect(passwordResetTokensRepo.create).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('creates token and sends email for valid email', async () => {
      usersRepo.findByEmailPlatformWide.mockResolvedValue(mockUser);

      await service.requestPasswordReset('broker@example.com');

      expect(passwordResetTokensRepo.create).toHaveBeenCalledWith(
        'user-uuid',
        expect.any(String),
        expect.any(Date),
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'broker@example.com' }),
      );
    });

    it('throws 429 when rate limit exceeded (>3 requests/hour)', async () => {
      redisMock.incr.mockResolvedValue(4);

      const err = await service
        .requestPasswordReset('broker@example.com')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(passwordResetTokensRepo.create).not.toHaveBeenCalled();
    });

    it('allows request when Redis is unavailable (fail-open rate limiting)', async () => {
      redisMock.incr.mockRejectedValue(new Error('ECONNREFUSED'));
      usersRepo.findByEmailPlatformWide.mockResolvedValue(mockUser);

      await service.requestPasswordReset('broker@example.com');

      expect(passwordResetTokensRepo.create).toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalled();
    });
  });

  describe('sendPasswordResetOtp', () => {
    beforeEach(() => {
      redisMock.incr.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);
      redisMock.set.mockResolvedValue('OK');
    });

    it('returns silently for non-existent email (anti-enumeration)', async () => {
      usersRepo.findByEmailPlatformWide.mockResolvedValue(null);

      await expect(
        service.sendPasswordResetOtp('nobody@example.com'),
      ).resolves.toBeUndefined();

      expect(redisMock.set).not.toHaveBeenCalled();
    });

    it('stores OTP in Redis and sends email for valid email', async () => {
      usersRepo.findByEmailPlatformWide.mockResolvedValue(mockUser);
      (
        emailService as unknown as { sendPasswordResetOtp: jest.Mock }
      ).sendPasswordResetOtp = jest.fn().mockResolvedValue(undefined);

      await service.sendPasswordResetOtp('broker@example.com');

      expect(redisMock.set).toHaveBeenCalledWith(
        '_system:pw_reset_otp:broker@example.com',
        expect.stringMatching(/^\d{6}$/),
        'EX',
        300,
      );
    });

    it('throws 429 when rate limit exceeded (>3 requests/hour)', async () => {
      redisMock.incr.mockResolvedValue(4);

      const err = await service
        .sendPasswordResetOtp('broker@example.com')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(redisMock.set).not.toHaveBeenCalled();
    });

    it('resolves silently for non-existent phone (anti-enumeration)', async () => {
      usersRepo.findByPhonePlatformWide = jest.fn().mockResolvedValue(null);

      await expect(
        service.sendPasswordResetOtp('+359888123456'),
      ).resolves.toBeUndefined();
    });
  });

  describe('verifyPasswordResetOtp', () => {
    beforeEach(() => {
      redisMock.get.mockResolvedValue('123456');
      redisMock.del.mockResolvedValue(1);
      usersRepo.findByEmailPlatformWide.mockResolvedValue(mockUser);
    });

    it('returns a JWT reset token on valid OTP', async () => {
      const token = await service.verifyPasswordResetOtp(
        'broker@example.com',
        '123456',
      );

      expect(token).toBe('signed-token');
      expect(redisMock.del).toHaveBeenCalledWith(
        '_system:pw_reset_otp:broker@example.com',
      );
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'pw_reset_otp' }),
        expect.any(Object),
      );
    });

    it('throws UnauthorizedException for invalid OTP', async () => {
      redisMock.get.mockResolvedValue('654321');

      await expect(
        service.verifyPasswordResetOtp('broker@example.com', '000000'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for expired OTP (null in Redis)', async () => {
      redisMock.get.mockResolvedValue(null);

      await expect(
        service.verifyPasswordResetOtp('broker@example.com', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('resetPasswordWithOtpToken', () => {
    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      usersRepo.updatePassword.mockResolvedValue(undefined);
      redisMock.scan.mockResolvedValue(['0', []]);
      redisMock.mget.mockResolvedValue([]);
    });

    it('resets password on valid pw_reset_otp token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid',
        tid: 'tenant-uuid',
        type: 'pw_reset_otp',
      });

      await service.resetPasswordWithOtpToken('valid-jwt', 'NewPass123!');

      expect(usersRepo.updatePassword).toHaveBeenCalledWith(
        'user-uuid',
        'new-hash',
      );
    });

    it('throws BadRequestException on expired/invalid JWT', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(
        service.resetPasswordWithOtpToken('expired-token', 'NewPass123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on wrong token type', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid',
        tid: 'tenant-uuid',
        type: 'temp_2fa',
      });

      await expect(
        service.resetPasswordWithOtpToken('wrong-type-token', 'NewPass123!'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resetPassword', () => {
    const validToken = {
      id: 'token-uuid',
      userId: 'user-uuid',
      tokenHash: expect.any(String) as string,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    };

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      usersRepo.updatePassword.mockResolvedValue(undefined);
      passwordResetTokensRepo.markAllUsedForUser.mockResolvedValue(undefined);
      usersRepo.findById.mockResolvedValue(mockUser);
      redisMock.scan.mockResolvedValue(['0', []]);
      redisMock.mget.mockResolvedValue([]);
    });

    it('throws BadRequestException for invalid (non-existent) token', async () => {
      passwordResetTokensRepo.findByTokenHash.mockResolvedValue(null);

      await expect(
        service.resetPassword('invalid-raw-token', 'NewPass123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for expired token', async () => {
      passwordResetTokensRepo.findByTokenHash.mockResolvedValue({
        ...validToken,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword('raw-token', 'NewPass123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for already-used token', async () => {
      passwordResetTokensRepo.findByTokenHash.mockResolvedValue({
        ...validToken,
        usedAt: new Date(),
      });

      await expect(
        service.resetPassword('raw-token', 'NewPass123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully resets password, marks all tokens used, and invalidates refresh tokens', async () => {
      const refreshKey = 'tenant-uuid:auth:refresh:some-jti';
      redisMock.scan
        .mockResolvedValueOnce(['0', [refreshKey]])
        .mockResolvedValue(['0', []]);
      redisMock.mget.mockResolvedValue(['user-uuid']);
      redisMock.del.mockResolvedValue(1);

      passwordResetTokensRepo.findByTokenHash.mockResolvedValue(validToken);

      await service.resetPassword('raw-token', 'NewPass123!');

      expect(usersRepo.updatePassword).toHaveBeenCalledWith(
        'user-uuid',
        'new-hash',
      );
      expect(passwordResetTokensRepo.markAllUsedForUser).toHaveBeenCalledWith(
        'user-uuid',
      );
      expect(redisMock.del).toHaveBeenCalledWith(refreshKey);
    });
  });
});
