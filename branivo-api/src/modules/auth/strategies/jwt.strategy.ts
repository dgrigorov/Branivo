import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.module';
import { RedisKeyHelper } from '../../../common/helpers/redis-key.helper';

export interface JwtPayload {
  sub: string;
  tid: string;
  role: string;
  jti: string;
  exp: number;
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: string;
  jti: string;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const blacklistKey = RedisKeyHelper.build(
      payload.tid,
      'auth',
      `blacklist:${payload.jti}`,
    );

    try {
      const revoked = await this.redis.exists(blacklistKey);
      if (revoked) {
        throw new UnauthorizedException('Token has been revoked');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(
        'Redis unavailable during token validation — fail-secure',
        err,
      );
      throw new UnauthorizedException('Auth service temporarily unavailable');
    }

    return {
      userId: payload.sub,
      tenantId: payload.tid,
      role: payload.role,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
