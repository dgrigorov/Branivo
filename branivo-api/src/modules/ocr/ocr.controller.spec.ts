import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { default as request } from 'supertest';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { OcrJobStatus, OcrProvider } from './entities/ocr-job.entity';
import { OcrScanResponseDto } from './dto/ocr-scan.dto';
import { OcrStatusResponseDto } from './dto/ocr-status.dto';
import { ThrottlerModule } from '@nestjs/throttler';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

const VALID_SESSION_TOKEN = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockOcrService = {
  scan: jest.fn(),
  getStatus: jest.fn(),
};

const mockVisionResult = {
  license_plate: { value: 'СА1234АА', confidence: 0.95, auto_filled: true },
  vin: { value: 'WVWZZZ3BZ3E123456', confidence: 0.92, auto_filled: true },
};

describe('OcrController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
        MulterModule.register({ storage: memoryStorage() }),
      ],
      controllers: [OcrController],
      providers: [{ provide: OcrService, useValue: mockOcrService }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const fakeImage = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=',
    'base64',
  );

  describe('POST /api/v1/ocr/scan', () => {
    it('returns 200 with completed status on vision success', async () => {
      mockOcrService.scan.mockResolvedValue({
        jobId: 'job-123',
        status: OcrJobStatus.COMPLETED,
        provider: OcrProvider.GOOGLE_VISION,
        fields: mockVisionResult,
        avgConfidence: 0.93,
      });

      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/ocr/scan')
        .set('X-Session-Token', VALID_SESSION_TOKEN)
        .attach('images', fakeImage, {
          filename: 'part1.jpg',
          contentType: 'image/jpeg',
        })
        .attach('images', fakeImage, {
          filename: 'part2.jpg',
          contentType: 'image/jpeg',
        });

      const body = res.body as OcrScanResponseDto;
      expect(res.status).toBe(200);
      expect(body.status).toBe(OcrJobStatus.COMPLETED);
      expect(body.provider).toBe(OcrProvider.GOOGLE_VISION);
    });

    it('returns 200 with processing status on textract fallback', async () => {
      mockOcrService.scan.mockResolvedValue({
        jobId: 'job-456',
        status: OcrJobStatus.PROCESSING,
      });

      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/ocr/scan')
        .set('X-Session-Token', VALID_SESSION_TOKEN)
        .attach('images', fakeImage, {
          filename: 'part1.jpg',
          contentType: 'image/jpeg',
        })
        .attach('images', fakeImage, {
          filename: 'part2.jpg',
          contentType: 'image/jpeg',
        });

      const body = res.body as OcrScanResponseDto;
      expect(res.status).toBe(200);
      expect(body.status).toBe(OcrJobStatus.PROCESSING);
      expect(body.jobId).toBe('job-456');
    });

    it('returns 429 when rate limit is exceeded', async () => {
      mockOcrService.scan.mockRejectedValue(
        new HttpException(
          'Твърде много заявки. Опитайте след малко.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/ocr/scan')
        .set('X-Session-Token', VALID_SESSION_TOKEN)
        .attach('images', fakeImage, {
          filename: 'p1.jpg',
          contentType: 'image/jpeg',
        })
        .attach('images', fakeImage, {
          filename: 'p2.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(429);
    });

    it('returns 400 when X-Session-Token is missing', async () => {
      const res = await request(app.getHttpServer() as import('http').Server)
        .post('/ocr/scan')
        .attach('images', fakeImage, {
          filename: 'p1.jpg',
          contentType: 'image/jpeg',
        })
        .attach('images', fakeImage, {
          filename: 'p2.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/ocr/status/:jobId', () => {
    it('returns 200 with job status', async () => {
      mockOcrService.getStatus.mockResolvedValue({
        jobId: 'job-789',
        status: OcrJobStatus.COMPLETED,
        provider: OcrProvider.GOOGLE_VISION,
        fields: mockVisionResult,
      });

      const res = await request(
        app.getHttpServer() as import('http').Server,
      ).get('/ocr/status/job-789');

      const body = res.body as OcrStatusResponseDto;
      expect(res.status).toBe(200);
      expect(body.jobId).toBe('job-789');
      expect(body.status).toBe(OcrJobStatus.COMPLETED);
    });

    it('returns 404 for unknown job', async () => {
      mockOcrService.getStatus.mockRejectedValue(
        new NotFoundException('OCR job unknown не е намерен'),
      );

      const res = await request(
        app.getHttpServer() as import('http').Server,
      ).get('/ocr/status/unknown');

      expect(res.status).toBe(404);
    });
  });
});
