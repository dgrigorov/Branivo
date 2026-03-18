import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const redisUrl = config.getOrThrow<string>('REDIS_URL');
        const client = new Redis(redisUrl, {
          maxRetriesPerRequest: null,
          retryStrategy: (times: number) => Math.min(times * 200, 3000),
          reconnectOnError: () => true,
          lazyConnect: false,
        });

        client.on('error', (err: Error) => {
          console.error('Redis connection error:', err.message);
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
