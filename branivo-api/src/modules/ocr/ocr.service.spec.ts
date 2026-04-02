import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { OcrService } from './ocr.service';
import { OcrJobStatus, OcrProvider } from './entities/ocr-job.entity';
import { GoogleVisionTimeoutError } from './providers/google-vision.service';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { OcrJobRepository } from './ocr-job.repository';
import { OcrScanRepository } from './ocr-scan.repository';
import { GoogleVisionService } from './providers/google-vision.service';
import { AwsTextractService } from './providers/aws-textract.service';
import { OcrQueueProducer } from './ocr-queue.producer';

const TENANT_ID = 'tenant-uuid-ocr';
const SESSION_TOKEN = 'anon-session-abc';
const CLIENT_IP = '1.2.3.4';
const JOB_ID = 'ocr-job-uuid-123';

const mockVisionResult = {
  license_plate: { value: 'СА1234АА', confidence: 0.95, auto_filled: true },
  vin: { value: 'WVWZZZ3BZ3E123456', confidence: 0.92, auto_filled: true },
  make: { value: 'Volkswagen', confidence: 0.9, auto_filled: true },
  model: { value: 'Golf', confidence: 0.88, auto_filled: true },
  year: { value: '2019', confidence: 0.91, auto_filled: true },
  color: { value: 'бял', confidence: 0.87, auto_filled: true },
  engine_volume: { value: '1395', confidence: 0.89, auto_filled: true },
  fuel_type: { value: 'бензин', confidence: 0.93, auto_filled: true },
  first_registration_date: {
    value: '15.03.2019',
    confidence: 0.86,
    auto_filled: true,
  },
};

const mockRedis = {
  eval: jest.fn().mockResolvedValue(1),
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue('OK'),
};

const mockOcrJobRepo = {
  createJob: jest
    .fn()
    .mockResolvedValue({ id: JOB_ID, status: OcrJobStatus.PROCESSING }),
  findById: jest.fn(),
  updateStatus: jest.fn().mockResolvedValue(undefined),
};

const mockGoogleVision = {
  analyzeImages: jest.fn(),
};

const mockAwsTextract = {
  uploadImagesToS3: jest.fn().mockResolvedValue({
    bucket: 'my-bucket',
    keys: ['ocr-temp/tid/jid/image-0.jpg', 'ocr-temp/tid/jid/image-1.jpg'],
  }),
  startAnalysis: jest.fn().mockResolvedValue('textract-job-id'),
  getResults: jest.fn(),
};

const mockOcrQueue = {
  enqueueTextractJob: jest.fn().mockResolvedValue(undefined),
};

const mockOcrScanRepo = {
  createScan: jest.fn().mockResolvedValue({ id: 'scan-uuid' }),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

const images = [Buffer.from('img1'), Buffer.from('img2')];

describe('OcrService', () => {
  let service: OcrService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.eval.mockResolvedValue(1);
    service = new OcrService(
      mockRedis as unknown as Redis,
      mockTenantContext as unknown as TenantContext,
      mockOcrJobRepo as unknown as OcrJobRepository,
      mockOcrScanRepo as unknown as OcrScanRepository,
      mockGoogleVision as unknown as GoogleVisionService,
      mockAwsTextract as unknown as AwsTextractService,
      mockOcrQueue as unknown as OcrQueueProducer,
    );
  });

  describe('scan — Google Vision success (high confidence)', () => {
    it('returns completed status with fields', async () => {
      mockGoogleVision.analyzeImages.mockResolvedValue(mockVisionResult);

      const result = await service.scan(images, SESSION_TOKEN, CLIENT_IP);

      expect(result.status).toBe(OcrJobStatus.COMPLETED);
      expect(result.provider).toBe(OcrProvider.GOOGLE_VISION);
      expect(result.fields).toEqual(mockVisionResult);
      expect(mockOcrJobRepo.updateStatus).toHaveBeenCalledWith(
        JOB_ID,
        OcrJobStatus.COMPLETED,
        expect.objectContaining({ provider: OcrProvider.GOOGLE_VISION }),
      );
    });
  });

  describe('scan — Google Vision timeout → Textract fallback', () => {
    it('enqueues a textract job per uploaded image and returns processing status', async () => {
      mockGoogleVision.analyzeImages.mockRejectedValue(
        new GoogleVisionTimeoutError(),
      );

      const result = await service.scan(images, SESSION_TOKEN, CLIENT_IP);

      expect(result.status).toBe(OcrJobStatus.PROCESSING);
      expect(result.jobId).toBe(JOB_ID);
      // One queue job is enqueued per S3 key (2 keys for 2 images).
      expect(mockOcrQueue.enqueueTextractJob).toHaveBeenCalledTimes(2);
      expect(mockOcrQueue.enqueueTextractJob).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: JOB_ID, tenantId: TENANT_ID }),
      );
    });
  });

  describe('scan — Google Vision general error → Textract fallback', () => {
    it('falls back to Textract on any Vision error', async () => {
      mockGoogleVision.analyzeImages.mockRejectedValue(
        new Error('Vision API 503'),
      );

      const result = await service.scan(images, SESSION_TOKEN, CLIENT_IP);

      expect(result.status).toBe(OcrJobStatus.PROCESSING);
      expect(mockOcrQueue.enqueueTextractJob).toHaveBeenCalled();
    });
  });

  describe('scan — rate limit exceeded', () => {
    it('throws HttpException with 429 on 11th request', async () => {
      mockRedis.eval.mockResolvedValue(11);

      const caught = await service
        .scan(images, SESSION_TOKEN, CLIENT_IP)
        .catch((e: unknown) => e);

      expect(caught).toBeInstanceOf(HttpException);
      expect((caught as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(mockGoogleVision.analyzeImages).not.toHaveBeenCalled();
    });
  });

  describe('scan — all providers fail gracefully', () => {
    it('sets job status to failed when Textract upload also fails', async () => {
      mockGoogleVision.analyzeImages.mockRejectedValue(
        new GoogleVisionTimeoutError(),
      );
      mockAwsTextract.uploadImagesToS3.mockRejectedValue(new Error('S3 error'));

      const result = await service.scan(images, SESSION_TOKEN, CLIENT_IP);

      expect(result.status).toBe(OcrJobStatus.FAILED);
      expect(mockOcrJobRepo.updateStatus).toHaveBeenCalledWith(
        JOB_ID,
        OcrJobStatus.FAILED,
        expect.objectContaining({ errorMessage: 'OCR service unavailable' }),
      );
    });
  });

  describe('scan — anonymous session update', () => {
    it('enriches Redis session with OCR data when session exists', async () => {
      const sessionData = { session_id: SESSION_TOKEN, tenant_id: TENANT_ID };
      mockRedis.get.mockResolvedValue(JSON.stringify(sessionData));
      mockGoogleVision.analyzeImages.mockResolvedValue(mockVisionResult);

      await service.scan(images, SESSION_TOKEN, CLIENT_IP);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `anon:${SESSION_TOKEN}:session`,
        172800,
        expect.stringContaining('ocr_job_id'),
      );
    });

    it('skips session update when session does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockGoogleVision.analyzeImages.mockResolvedValue(mockVisionResult);

      await service.scan(images, SESSION_TOKEN, CLIENT_IP);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns completed job with fields', async () => {
      mockOcrJobRepo.findById.mockResolvedValue({
        id: JOB_ID,
        status: OcrJobStatus.COMPLETED,
        provider: OcrProvider.GOOGLE_VISION,
        result: mockVisionResult,
      });

      const result = await service.getStatus(JOB_ID);

      expect(result.status).toBe(OcrJobStatus.COMPLETED);
      expect(result.fields).toEqual(mockVisionResult);
    });

    it('returns processing status without fields', async () => {
      mockOcrJobRepo.findById.mockResolvedValue({
        id: JOB_ID,
        status: OcrJobStatus.PROCESSING,
        provider: null,
        result: null,
      });

      const result = await service.getStatus(JOB_ID);

      expect(result.status).toBe(OcrJobStatus.PROCESSING);
      expect(result.fields).toBeUndefined();
    });

    it('throws NotFoundException for unknown job', async () => {
      mockOcrJobRepo.findById.mockResolvedValue(null);

      await expect(service.getStatus('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reportMlKitScan', () => {
    const dto = {
      session_token: SESSION_TOKEN,
      images_count: 2,
      fields: mockVisionResult,
      raw_text: 'raw ocr text',
    };

    it('records ML Kit scan and returns completed status', async () => {
      const result = await service.reportMlKitScan(dto, CLIENT_IP);

      expect(result.status).toBe(OcrJobStatus.COMPLETED);
      expect(result.provider).toBe(OcrProvider.ML_KIT);
      expect(mockOcrJobRepo.createJob).toHaveBeenCalled();
      expect(mockOcrJobRepo.updateStatus).toHaveBeenCalledWith(
        JOB_ID,
        OcrJobStatus.COMPLETED,
        expect.objectContaining({ provider: OcrProvider.ML_KIT }),
      );
    });

    it('enforces rate limit for ML Kit reports', async () => {
      mockRedis.eval.mockResolvedValue(11);

      const caught = await service
        .reportMlKitScan(dto, CLIENT_IP)
        .catch((e: unknown) => e);

      expect(caught).toBeInstanceOf(HttpException);
      expect((caught as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(mockOcrJobRepo.createJob).not.toHaveBeenCalled();
    });

    it('propagates DB errors with logging', async () => {
      mockOcrJobRepo.createJob.mockRejectedValue(new Error('DB unavailable'));

      await expect(service.reportMlKitScan(dto, CLIENT_IP)).rejects.toThrow(
        'DB unavailable',
      );
    });
  });

  describe('logScan', () => {
    it('creates an ocr_scan record', async () => {
      await service.logScan({
        blur_variance: 180.0,
        final_score: 0.87,
        score_bucket: 'auto',
        vin_found: true,
      });

      expect(mockOcrScanRepo.createScan).toHaveBeenCalledWith(
        expect.objectContaining({
          blur_variance: 180.0,
          score_bucket: 'auto',
          vin_found: true,
        }),
      );
    });

    it('does not throw when createScan fails (analytics best-effort)', async () => {
      mockOcrScanRepo.createScan.mockRejectedValue(new Error('DB error'));

      await expect(service.logScan({})).resolves.toBeUndefined();
    });
  });
});
