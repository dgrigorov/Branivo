import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getQueueToken } from '@nestjs/bull';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import {
  QUEUE_BILLING,
  QUEUE_DATA_EXPORT,
  QUEUE_LOGISTICS,
  QUEUE_NOTIFICATIONS,
  QUEUE_OCR_PROCESSING,
  QUEUE_PDF_GENERATION,
  QUEUE_VEHICLE_CATALOG_SYNC,
  QUEUE_WEBHOOK_PROCESSING,
} from './infrastructure/queues/queue.module';
import type { Queue } from 'bull';

const ALL_QUEUES = [
  QUEUE_PDF_GENERATION,
  QUEUE_NOTIFICATIONS,
  QUEUE_LOGISTICS,
  QUEUE_OCR_PROCESSING,
  QUEUE_WEBHOOK_PROCESSING,
  QUEUE_BILLING,
  QUEUE_DATA_EXPORT,
  QUEUE_VEHICLE_CATALOG_SYNC,
];

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Security headers
  app.use(
    helmet({
      hsts: { maxAge: 31536000, includeSubDomains: true },
      frameguard: { action: 'deny' },
      contentSecurityPolicy: true,
      noSniff: true,
      xssFilter: true,
    }),
  );

  // CORS
  app.enableCors({ origin: false });

  // Global prefix + URI versioning (/api/v1/...)
  // Exclude .well-known/* so Apple Pay domain verification works at the root level
  app.setGlobalPrefix('api', {
    exclude: ['.well-known/apple-developer-merchantid-domain-association'],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global pipes, filters, interceptors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger — only in non-production
  const env = process.env.NODE_ENV ?? 'development';
  if (env !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Branivo API')
      .setDescription('Branivo White-Label Branivo Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Bull Board — queue monitor (only in non-production)
  if (env !== 'production') {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/queue-board');

    const queues = ALL_QUEUES.map(
      (name) => new BullAdapter(app.get<Queue>(getQueueToken(name))),
    );

    createBullBoard({ queues, serverAdapter });

    app.use('/queue-board', serverAdapter.getRouter());
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Branivo API running on port ${port}`);
  if (env !== 'production') {
    console.log(`Bull Board available at http://localhost:${port}/queue-board`);
  }
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
