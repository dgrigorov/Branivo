import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { AnonSessionData } from './interfaces/anon-session.interface';
import { UpdateAnonSessionDto } from './dto/update-anon-session.dto';
import { CreateSessionResponseDto } from './dto/create-session-response.dto';

const SESSION_TTL_SECONDS = 172800; // 48 hours

@Injectable()
export class AnonymousSessionsService {
  private readonly logger = new Logger(AnonymousSessionsService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private buildKey(sessionId: string): string {
    return `anon:${sessionId}:session`;
  }

  async createSession(tenantId: string): Promise<CreateSessionResponseDto> {
    const sessionId = uuidv4();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

    const data: AnonSessionData = {
      session_id: sessionId,
      tenant_id: tenantId,
      created_at: createdAt,
    };

    try {
      await this.redis.setex(
        this.buildKey(sessionId),
        SESSION_TTL_SECONDS,
        JSON.stringify(data),
      );
    } catch (err) {
      this.logger.error(
        'Redis unavailable for anonymous session creation',
        err,
      );
      throw new ServiceUnavailableException({
        statusCode: 503,
        requires_login: true,
        message: 'Временно изискваме регистрация',
      });
    }

    return {
      session_id: sessionId,
      expires_at: expiresAt.toISOString(),
    };
  }

  async getSession(
    sessionId: string,
    tenantId: string,
  ): Promise<AnonSessionData | null> {
    let raw: string | null;
    try {
      raw = await this.redis.get(this.buildKey(sessionId));
    } catch (err) {
      this.logger.error('Redis unavailable for anonymous session get', err);
      throw new ServiceUnavailableException({
        statusCode: 503,
        requires_login: true,
        message: 'Временно изискваме регистрация',
      });
    }

    if (!raw) return null;

    const data = JSON.parse(raw) as AnonSessionData;

    // Tenant isolation: reject if tenant mismatch
    if (data.tenant_id !== tenantId) return null;

    return data;
  }

  async updateSessionData(
    sessionId: string,
    tenantId: string,
    dto: UpdateAnonSessionDto,
  ): Promise<void> {
    const existing = await this.getSession(sessionId, tenantId);
    if (!existing) {
      throw new NotFoundException('Session not found or expired');
    }

    const updated: AnonSessionData = {
      ...existing,
      ...(dto.vehicle_data !== undefined && { vehicle_data: dto.vehicle_data }),
      ...(dto.selected_quote_id !== undefined && {
        selected_quote_id: dto.selected_quote_id,
      }),
    };

    try {
      // SETEX resets TTL on every update
      await this.redis.setex(
        this.buildKey(sessionId),
        SESSION_TTL_SECONDS,
        JSON.stringify(updated),
      );
    } catch (err) {
      this.logger.error('Redis unavailable for anonymous session update', err);
      throw new ServiceUnavailableException({
        statusCode: 503,
        requires_login: true,
        message: 'Временно изискваме регистрация',
      });
    }
  }

  async migrateSession(
    sessionId: string,
    tenantId: string,
    userId: string,
  ): Promise<AnonSessionData> {
    const data = await this.getSession(sessionId, tenantId);
    if (!data) {
      throw new NotFoundException('Session not found or expired');
    }

    this.logger.log(
      `Migrating anonymous session ${sessionId} to user ${userId}`,
    );

    try {
      await this.redis.del(this.buildKey(sessionId));
    } catch (err) {
      this.logger.error('Redis error during session migration', err);
      // Still return data — migration can proceed even if DEL fails
    }

    return data;
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.redis.del(this.buildKey(sessionId));
    } catch (err) {
      this.logger.error('Redis error during session delete', err);
    }
  }
}
