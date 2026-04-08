import {
  ConflictException,
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
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { EndClientRepository } from './repositories/end-client.repository';
import { SmsService } from './sms.service';
import { EndClient } from './entities/end-client.entity';
import { GoogleAuthDto } from './dto/google-auth.dto';

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
    await this.verifyOtpCode(phoneNumber, otpCode, tenantId);

    const { client, isNew } = await this.endClientRepository.findOrCreate(
      phoneNumber,
      tenantId,
    );
    await this.endClientRepository.markPhoneVerified(client.id);
    client.phoneVerified = true;

    return { client, isNew };
  }

  private async verifyOtpCode(
    phoneNumber: string,
    otpCode: string,
    tenantId: string,
  ): Promise<void> {
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

    // OTP correct — consume immediately before any business logic checks
    try {
      await Promise.all([this.redis.del(otpKey), this.redis.del(attemptsKey)]);
    } catch (err) {
      this.logger.error('Redis cleanup error after OTP verify', err);
    }
  }

  async googleAuth(
    dto: GoogleAuthDto,
    tenantId: string,
  ): Promise<{ client: EndClient; isNew: boolean; accountMerged: boolean }> {
    const googleClientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const oauthClient = new OAuth2Client(googleClientId);

    let googleSub: string;
    let email: string | undefined;
    let givenName: string | undefined;
    let familyName: string | undefined;

    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: dto.id_token,
        audience: googleClientId,
      });
      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Invalid Google token');
      }
      googleSub = payload.sub;
      email = payload.email;
      givenName = payload.given_name;
      familyName = payload.family_name;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error('Google token verification failed', err);
      throw new UnauthorizedException('Invalid Google token');
    }

    // 1. Find by google_sub → direct login
    const byGoogleSub = await this.endClientRepository.findByGoogleSub(
      tenantId,
      googleSub,
    );
    if (byGoogleSub) {
      return { client: byGoogleSub, isNew: false, accountMerged: false };
    }

    // 2. Find by email (SMS customer) → auto-merge
    if (email) {
      const byEmail = await this.endClientRepository.findByEmail(
        tenantId,
        email,
      );
      if (byEmail) {
        await this.endClientRepository.mergeGoogleAccount(
          byEmail.id,
          googleSub,
        );
        byEmail.googleSub = googleSub;
        byEmail.authProvider = 'google';
        return { client: byEmail, isNew: false, accountMerged: true };
      }
    }

    // 3. Create new Google client
    const newClient = await this.endClientRepository.createGoogleClient({
      tenantId,
      googleSub,
      email: email ?? null,
      firstName: givenName ?? null,
      lastName: familyName ?? null,
    });

    return { client: newClient, isNew: true, accountMerged: false };
  }

  async requestPhoneOtp(
    phoneNumber: string,
    tenantId: string,
  ): Promise<{ expires_in: number }> {
    return this.requestOtp(phoneNumber, tenantId);
  }

  async verifyPhoneOtp(
    clientId: string,
    phoneNumber: string,
    otpCode: string,
    tenantId: string,
  ): Promise<void> {
    await this.verifyOtpCode(phoneNumber, otpCode, tenantId);

    // Check phone is not already used by another account in this tenant
    const existing = await this.endClientRepository.findByPhone(
      phoneNumber,
      tenantId,
    );
    if (existing && existing.id !== clientId) {
      throw new ConflictException(
        'Телефонният номер вече е свързан с друг акаунт.',
      );
    }

    await this.endClientRepository.updatePhone(clientId, phoneNumber);
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
