import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders } from 'axios';
import Redis from 'ioredis';
import {
  GarantsionenFondAdapter,
  GfCheckResult,
} from './garantsionen-fond.adapter';
import { GfApiUnavailableError } from '../exceptions/gf-api-unavailable.exception';
import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.module';

const VALID_VIN = 'WVWZZZ3BZ3E123456';
const LICENSE_PLATE = 'СА1234АА';
const CACHE_KEY = `gf:vehicle:${VALID_VIN}`;

function makeAxiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
}

describe('GarantsionenFondAdapter', () => {
  let adapter: GarantsionenFondAdapter;
  let httpService: jest.Mocked<Pick<HttpService, 'post'>>;
  let redis: jest.Mocked<Pick<Redis, 'get' | 'setex'>>;
  let configValues: Record<string, string>;

  beforeEach(async () => {
    configValues = {
      GF_API_BASE_URL: 'http://gf-api.test',
      GF_API_KEY: 'test-api-key',
    };

    httpService = { post: jest.fn() };
    redis = {
      get: jest.fn(),
      setex: jest.fn().mockResolvedValue('OK'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GarantsionenFondAdapter,
        {
          provide: HttpService,
          useValue: httpService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key] ?? ''),
          },
        },
        {
          provide: REDIS_CLIENT,
          useValue: redis,
        },
      ],
    }).compile();

    adapter = module.get<GarantsionenFondAdapter>(GarantsionenFondAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Test 1: cache hit', () => {
    it('cache hit → returns cached result with source: cache, HTTP NOT called', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({ flagged: false, reason: undefined }),
      );

      const result = await adapter.checkVehicle(VALID_VIN, LICENSE_PLATE);

      expect(result.source).toBe('cache');
      expect(result.flagged).toBe(false);
      expect(redis.get).toHaveBeenCalledWith(CACHE_KEY);
      expect(httpService.post).not.toHaveBeenCalled();
    });
  });

  describe('Test 2: API clean', () => {
    it('API returns flagged: false → caches result, source: api', async () => {
      redis.get.mockResolvedValue(null);
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ flagged: false })),
      );

      const result = await adapter.checkVehicle(VALID_VIN, LICENSE_PLATE);

      expect(result.flagged).toBe(false);
      expect(result.source).toBe('api');
      expect(redis.setex).toHaveBeenCalledWith(
        CACHE_KEY,
        86400,
        JSON.stringify({ flagged: false, reason: undefined }),
      );
    });
  });

  describe('Test 3: API flagged', () => {
    it('API returns flagged: true → caches result, source: api', async () => {
      redis.get.mockResolvedValue(null);
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ flagged: true, reason: 'stolen' })),
      );

      const result = await adapter.checkVehicle(VALID_VIN, LICENSE_PLATE);

      expect(result.flagged).toBe(true);
      expect(result.reason).toBe('stolen');
      expect(result.source).toBe('api');
      expect(redis.setex).toHaveBeenCalledWith(
        CACHE_KEY,
        86400,
        JSON.stringify({ flagged: true, reason: 'stolen' }),
      );
    });
  });

  describe('Test 4: timeout → GfApiUnavailableError', () => {
    it('HTTP error → throws GfApiUnavailableError', async () => {
      redis.get.mockResolvedValue(null);
      httpService.post.mockReturnValue(
        throwError(() => new Error('connect ECONNREFUSED')),
      );

      await expect(
        adapter.checkVehicle(VALID_VIN, LICENSE_PLATE),
      ).rejects.toBeInstanceOf(GfApiUnavailableError);
    });
  });

  describe('Test 5: no GF_API_BASE_URL', () => {
    it('no GF_API_BASE_URL → returns manual_fallback without HTTP call', async () => {
      configValues['GF_API_BASE_URL'] = '';
      // Re-create adapter with empty URL
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GarantsionenFondAdapter,
          {
            provide: HttpService,
            useValue: httpService,
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => configValues[key] ?? ''),
            },
          },
          {
            provide: REDIS_CLIENT,
            useValue: redis,
          },
        ],
      }).compile();

      const fallbackAdapter = module.get<GarantsionenFondAdapter>(
        GarantsionenFondAdapter,
      );
      redis.get.mockResolvedValue(null);

      const result: GfCheckResult = await fallbackAdapter.checkVehicle(
        VALID_VIN,
        LICENSE_PLATE,
      );

      expect(result.source).toBe('manual_fallback');
      expect(result.flagged).toBe(false);
      expect(httpService.post).not.toHaveBeenCalled();
    });
  });

  describe('Test 6: circuit breaker open → GfApiUnavailableError', () => {
    it('circuit breaker open (repeated failures) → throws GfApiUnavailableError', async () => {
      redis.get.mockResolvedValue(null);
      // Simulate repeated failures to open the circuit
      httpService.post.mockReturnValue(
        throwError(() => new Error('connection refused')),
      );

      // Fire enough requests to open the circuit (volumeThreshold: 5)
      const attempts = Array.from({ length: 5 }, () =>
        adapter.checkVehicle(VALID_VIN, LICENSE_PLATE).catch(() => null),
      );
      await Promise.all(attempts);

      // After breaker opens, further calls should also throw GfApiUnavailableError
      await expect(
        adapter.checkVehicle(VALID_VIN, LICENSE_PLATE),
      ).rejects.toBeInstanceOf(GfApiUnavailableError);
    });
  });
});
