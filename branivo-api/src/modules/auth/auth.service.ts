import {
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly tenantsRepository: TenantsRepository,
    private readonly cryptoService: CryptoService,
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
