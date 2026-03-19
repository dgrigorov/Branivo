import { Inject, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.module';
import { GfApiUnavailableError } from '../exceptions/gf-api-unavailable.exception';

export interface GfCheckResult {
  flagged: boolean;
  reason?: string;
  source: 'cache' | 'api' | 'manual_fallback';
}

interface GfApiResponse {
  flagged: boolean;
  reason?: string;
}

interface CachedGfResult {
  flagged: boolean;
  reason?: string;
}

const GF_CACHE_TTL_SECONDS = 86400; // 24h

@Injectable()
export class GarantsionenFondAdapter {
  private readonly logger = new Logger(GarantsionenFondAdapter.name);
  private readonly gfApiBaseUrl: string;
  private readonly gfApiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.gfApiBaseUrl = this.config.get<string>('GF_API_BASE_URL') ?? '';
    this.gfApiKey = this.config.get<string>('GF_API_KEY') ?? '';
  }

  async checkVehicle(
    vin: string,
    licensePlate: string,
  ): Promise<GfCheckResult> {
    const cacheKey = `gf:vehicle:${vin}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedGfResult;
      return { ...parsed, source: 'cache' };
    }

    if (!this.gfApiBaseUrl) {
      this.logger.warn('GF_API_BASE_URL not configured — returning mock clean');
      return { flagged: false, source: 'manual_fallback' };
    }

    try {
      const response = await firstValueFrom(
        this.httpService
          .post<GfApiResponse>(
            `${this.gfApiBaseUrl}/check`,
            { vin, licensePlate },
            { headers: { Authorization: `Bearer ${this.gfApiKey}` } },
          )
          .pipe(
            timeout(5000),
            catchError((err: unknown) => {
              this.logger.error('GF API HTTP/timeout error', err);
              throw new GfApiUnavailableError();
            }),
          ),
      );

      const result: GfCheckResult = {
        flagged: response.data.flagged,
        reason: response.data.reason,
        source: 'api',
      };

      await this.redis.setex(
        cacheKey,
        GF_CACHE_TTL_SECONDS,
        JSON.stringify({ flagged: result.flagged, reason: result.reason }),
      );

      return result;
    } catch (err) {
      if (err instanceof GfApiUnavailableError) throw err;
      this.logger.error('GF API unexpected error', err);
      throw new GfApiUnavailableError();
    }
  }
}
