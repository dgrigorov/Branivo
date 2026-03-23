import * as crypto from 'crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { verifySync } from 'otplib';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { RedisKeyHelper } from '../../common/helpers/redis-key.helper';
import { CryptoService } from '../../common/crypto/crypto.service';
import { UsersRepository } from '../users/users.repository';
import { TenantsRepository } from '../tenants/tenants.repository';
import { EmailService } from '../../infrastructure/email/email.service';
import { PasswordResetTokensRepository } from './password-reset-tokens.repository';
import {
  AuthTokensResponseDto,
  LoginResponseDto,
} from './dto/auth-response.dto';

const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 min
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const TEMP_2FA_TTL_SECONDS = 300; // 5 min
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 900; // 15 min

interface AccessTokenPayload {
  sub: string;
  tid: string;
  role: string;
  jti: string;
}

interface TempTokenPayload {
  sub: string;
  tid: string;
  type: 'temp_2fa';
}

interface RefreshTokenPayload {
  sub: string;
  tid: string;
  jti: string;
  type: 'refresh';
}

const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000; // 15 min
const PASSWORD_RESET_RATE_LIMIT = 3;
const PASSWORD_RESET_RATE_TTL_SECONDS = 3600; // 1 hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly tenantsRepository: TenantsRepository,
    private readonly cryptoService: CryptoService,
    private readonly emailService: EmailService,
    private readonly passwordResetTokensRepository: PasswordResetTokensRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async login(
    host: string,
    email: string,
    password: string,
  ): Promise<LoginResponseDto> {
    const tenantId = await this.resolveTenantFromHost(host);

    const user = await this.usersRepository.findByEmailAndTenant(
      email,
      tenantId,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        'Account temporarily locked. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      const { lockedUntil } = await this.usersRepository.incrementAndMaybeLock(
        user.id,
        MAX_FAILED_ATTEMPTS,
        LOCKOUT_DURATION_SECONDS,
      );
      if (lockedUntil) {
        throw new HttpException(
          'Account temporarily locked. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersRepository.resetFailedLoginCount(user.id);

    if (user.twoFaEnabled) {
      const secret = this.config.getOrThrow<string>('JWT_SECRET');
      const tempToken = this.jwtService.sign(
        { sub: user.id, tid: tenantId, type: 'temp_2fa' },
        { secret, expiresIn: TEMP_2FA_TTL_SECONDS },
      );
      return { requires_2fa: true, temp_token: tempToken };
    }

    return this.issueTokens(user.id, tenantId, user.role);
  }

  async verify2FA(
    tempToken: string,
    otpCode: string,
  ): Promise<AuthTokensResponseDto> {
    let payload: TempTokenPayload;
    try {
      payload = this.jwtService.verify<TempTokenPayload>(tempToken, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired 2FA session');
    }

    if (payload.type !== 'temp_2fa') {
      throw new UnauthorizedException('Invalid token type');
    }

    const userById = await this.findUserById(payload.sub, payload.tid);
    if (!userById || !userById.twoFaSecretEnc) {
      throw new UnauthorizedException('Invalid 2FA configuration');
    }

    const secret = this.cryptoService.decrypt(userById.twoFaSecretEnc);

    const { valid: isValid } = verifySync({ token: otpCode, secret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    return this.issueTokens(userById.id, payload.tid, userById.role);
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponseDto> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const redisKey = RedisKeyHelper.build(
      payload.tid,
      'auth',
      `refresh:${payload.jti}`,
    );

    let storedUserId: string | null;
    try {
      storedUserId = await this.redis.get(redisKey);
    } catch (err) {
      this.logger.error(
        'Redis unavailable during token refresh — fail-secure',
        err,
      );
      throw new UnauthorizedException(
        'Session service unavailable. Please log in again.',
      );
    }

    if (!storedUserId) {
      throw new UnauthorizedException(
        'Session expired or revoked. Please log in again.',
      );
    }

    // Rotate: delete old refresh token
    await this.redis.del(redisKey);

    const user = await this.findUserById(payload.sub, payload.tid);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueTokens(user.id, payload.tid, user.role);
  }

  async logout(
    jti: string,
    tenantId: string,
    tokenExpSeconds: number,
  ): Promise<void> {
    const remainingTtl = tokenExpSeconds - Math.floor(Date.now() / 1000);
    if (remainingTtl <= 0) return;

    const blacklistKey = RedisKeyHelper.build(
      tenantId,
      'auth',
      `blacklist:${jti}`,
    );
    try {
      await this.redis.set(blacklistKey, '1', 'EX', remainingTtl);
    } catch (err) {
      this.logger.error(
        'Redis unavailable during logout — token NOT blacklisted, fail-secure',
        err,
      );
      throw new ServiceUnavailableException(
        'Logout incomplete: session service unavailable. Token will expire naturally.',
      );
    }
  }

  private async issueTokens(
    userId: string,
    tenantId: string,
    role: string,
  ): Promise<AuthTokensResponseDto> {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const accessJti = uuidv4();
    const refreshJti = uuidv4();

    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        tid: tenantId,
        role,
        jti: accessJti,
      } satisfies AccessTokenPayload,
      { secret, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: userId,
        tid: tenantId,
        jti: refreshJti,
        type: 'refresh',
      } satisfies RefreshTokenPayload,
      { secret, expiresIn: REFRESH_TOKEN_TTL_SECONDS },
    );

    const refreshKey = RedisKeyHelper.build(
      tenantId,
      'auth',
      `refresh:${refreshJti}`,
    );
    await this.redis.set(refreshKey, userId, 'EX', REFRESH_TOKEN_TTL_SECONDS);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async requestPasswordReset(email: string): Promise<void> {
    const rateKey = `_system:password_reset_rate:${email}`;
    let count: number;
    try {
      count = await this.redis.incr(rateKey);
      if (count === 1) {
        await this.redis.expire(rateKey, PASSWORD_RESET_RATE_TTL_SECONDS);
      }
    } catch (err) {
      this.logger.warn(
        'Redis unavailable for password reset rate limit — fail-open',
        err,
      );
      count = 1;
    }
    if (count > PASSWORD_RESET_RATE_LIMIT) {
      throw new HttpException(
        'Твърде много заявки. Моля, изчакайте преди да опитате отново.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.usersRepository.findByEmailPlatformWide(email);
    if (!user) {
      // Anti-enumeration: return silently
      return;
    }

    this.logger.log(`Password reset requested for email: ${email}`);

    const { raw, hash } = this.generateResetToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await this.passwordResetTokensRepository.deleteExpiredForUser(user.id);
    await this.passwordResetTokensRepository.create(user.id, hash, expiresAt);

    try {
      await this.emailService.sendPasswordResetEmail({
        to: user.email,
        resetToken: raw,
        tenantId: user.tenantId,
      });
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${email}`, err);
      throw new ServiceUnavailableException(
        'Неуспешно изпращане на имейл. Моля, опитайте отново.',
      );
    }
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const token =
      await this.passwordResetTokensRepository.findByTokenHash(tokenHash);

    if (!token) {
      throw new BadRequestException('Линкът е изтекъл или вече е използван');
    }
    if (token.expiresAt <= new Date()) {
      throw new BadRequestException('Линкът е изтекъл или вече е използван');
    }
    if (token.usedAt !== null) {
      throw new BadRequestException('Линкът е изтекъл или вече е използван');
    }

    const passwordHash: string = await bcrypt.hash(newPassword, 12);
    await this.usersRepository.updatePassword(token.userId, passwordHash);

    const user = await this.usersRepository.findById(token.userId);
    if (user) {
      await this.invalidateAllRefreshTokensForUser(token.userId, user.tenantId);
    }

    await this.passwordResetTokensRepository.markAllUsedForUser(token.userId);
    this.logger.log(`Password reset completed for userId: ${token.userId}`);
  }

  private async invalidateAllRefreshTokensForUser(
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const pattern = RedisKeyHelper.build(tenantId, 'auth', 'refresh:*');
    let cursor = '0';
    do {
      const [nextCursor, keys] = (await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        '100',
      )) as [string, string[]];
      cursor = nextCursor;
      if (keys.length > 0) {
        const values = await this.redis.mget(...keys);
        const keysToDelete = keys.filter((_, i) => values[i] === userId);
        if (keysToDelete.length > 0) {
          await this.redis.del(...keysToDelete);
        }
      }
    } while (cursor !== '0');
    this.logger.log(`Invalidated all refresh tokens for userId: ${userId}`);
  }

  private generateResetToken(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return { raw, hash };
  }

  private async resolveTenantFromHost(host: string): Promise<string> {
    const cacheKey = RedisKeyHelper.buildSystem('host', host);

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return cached;
    } catch {
      this.logger.warn(`Redis unavailable for host lookup: ${host}`);
    }

    const tenantId = await this.tenantsRepository.findTenantIdByHostname(host);
    if (!tenantId) {
      throw new NotFoundException('Tenant not found');
    }

    try {
      await this.redis.set(cacheKey, tenantId, 'EX', 3600);
    } catch {
      this.logger.warn(
        'Redis unavailable — could not cache tenant host lookup',
      );
    }

    return tenantId;
  }

  private async findUserById(userId: string, tenantId: string) {
    return this.usersRepository.findByIdAndTenant(userId, tenantId);
  }

  // Exposed for JwtStrategy blacklist check
  async isTokenBlacklisted(jti: string, tenantId: string): Promise<boolean> {
    const blacklistKey = RedisKeyHelper.build(
      tenantId,
      'auth',
      `blacklist:${jti}`,
    );
    try {
      const result = await this.redis.exists(blacklistKey);
      return result === 1;
    } catch (err) {
      this.logger.error(
        'Redis unavailable during blacklist check — fail-secure',
        err,
      );
      // fail-secure: treat as revoked
      return true;
    }
  }
}
