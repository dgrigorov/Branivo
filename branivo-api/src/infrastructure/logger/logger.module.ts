import { Module, Global } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp({
                format: () => new Date().toISOString(),
              }),
              winston.format.json(),
            ),
            silent: config.get('NODE_ENV') === 'test',
          }),
        ],
      }),
    }),
  ],
})
export class LoggerModule {}
