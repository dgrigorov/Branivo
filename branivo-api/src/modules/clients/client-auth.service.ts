import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { EndClientRepository } from './repositories/end-client.repository';
import { SmsService } from './sms.service';
import { EndClient } from './entities/end-client.entity';

const OTP_TTL_SECONDS = 300; // 5 min
const OTP_ATTEMPTS_TTL_SECONDS = 3600; // 1 hour
const OTP_REQUEST_TTL_SECONDS = 3600; // 1 hour
const MAX_OTP_ATTEMPTS = 3;
const MAX_OTP_REQUESTS = 3;

const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 min
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

@Injectable()
export class ClientAuthService {
  private readonly logger = new Logger(ClientAuthService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly endClientRepository: EndClientRepository,
    private readonly smsService: SmsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async requestOtp(
    phoneNumber: string,
    tenantId: string,
  ): Promise<{ expires_in: number }> {
    const reqKey = `client_otp_req:${tenantId}:${phoneNumber}`;

    let reqCount: number;
    try {
      reqCount = await this.redis.incr(reqKey);
      if (reqCount === 1) {
        await this.redis.expire(reqKey, OTP_REQUEST_TTL_SECONDS);
      }
    } catch (err) {
      this.logger.error('Redis error during OTP request rate check', err);
      throw new ServiceUnavailableException('Услугата временно не е достъпна');
    }

    if (reqCount > MAX_OTP_REQUESTS) {
      throw new HttpException(
        {
          message: 'Изпратихте твърде много кодове. Опитайте след 1 час.',
          retry_after: 3600,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpKey = `client_otp:${tenantId}:${phoneNumber}`;

    try {
      await this.redis.setex(otpKey, OTP_TTL_SECONDS, otpCode);
    } catch (err) {
      this.logger.error('Redis error during OTP store', err);
      throw new ServiceUnavailableException('Услугата временно не е достъпна');
    }

    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.warn(
        `\n${'='.repeat(50)}\n[DEV OTP] ${phoneNumber} → ${otpCode}\n${'='.repeat(50)}`,
      );
    }

    await this.smsService.sendOtp(phoneNumber, otpCode);

    return { expires_in: OTP_TTL_SECONDS };
  }

  async verifyOtp(
    phoneNumber: string,
    otpCode: string,
    tenantId: string,
  ): Promise<{ client: EndClient; isNew: boolean }> {
    const attemptsKey = `client_otp_attempts:${tenantId}:${phoneNumber}`;
    const otpKey = `client_otp:${tenantId}:${phoneNumber}`;

    let attempts: number;
    let storedOtp: string | null;

    try {
      const [attemptsRaw, stored] = await Promise.all([
        this.redis.get(attemptsKey),
        this.redis.get(otpKey),
      ]);
      attempts = attemptsRaw ? parseInt(attemptsRaw, 10) : 0;
      storedOtp = stored;
    } catch (err) {
      this.logger.error('Redis error during OTP verify', err);
      throw new ServiceUnavailableException('Услугата временно не е достъпна');
    }

    if (attempts >= MAX_OTP_ATTEMPTS) {
      throw new HttpException(
        {
          message: 'Твърде много опити. Опитайте след 1 час.',
          retry_after: 3600,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!storedOtp) {
      throw new UnprocessableEntityException({
        message: 'Кодът е изтекъл. Поискайте нов код.',
      });
    }

    if (storedOtp !== otpCode) {
      try {
        const newAttempts = await this.redis.incr(attemptsKey);
        if (newAttempts === 1) {
          await this.redis.expire(attemptsKey, OTP_ATTEMPTS_TTL_SECONDS);
        }
      } catch (err) {
        this.logger.error('Redis error during attempt increment', err);
      }
      throw new UnauthorizedException({ message: 'Грешен код.' });
    }

    // OTP is correct — clean up
    try {
      await Promise.all([this.redis.del(otpKey), this.redis.del(attemptsKey)]);
    } catch (err) {
      this.logger.error('Redis cleanup error after OTP verify', err);
    }

    const { client, isNew } = await this.endClientRepository.findOrCreate(
      phoneNumber,
      tenantId,
    );
    await this.endClientRepository.markPhoneVerified(client.id);
    client.phoneVerified = true;

    return { client, isNew };
  }

  async generateTokens(
    client: EndClient,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const tenantId = client.tenantId;
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const accessJti = uuidv4();
    const refreshJti = uuidv4();

    const accessToken = this.jwtService.sign(
      { sub: client.id, tid: tenantId, role: 'end_client', jti: accessJti },
      { secret, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );

    const refreshToken = this.jwtService.sign(
      { sub: client.id, tid: tenantId, jti: refreshJti, type: 'refresh' },
      { secret, expiresIn: REFRESH_TOKEN_TTL_SECONDS },
    );

    const refreshKey = `${tenantId}:auth:refresh:${refreshJti}`;
    try {
      await this.redis.set(
        refreshKey,
        client.id,
        'EX',
        REFRESH_TOKEN_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.error('Redis error storing refresh token', err);
      throw new ServiceUnavailableException('Услугата временно не е достъпна');
    }

    return { access_token: accessToken, refresh_token: refreshToken };
  }
}
