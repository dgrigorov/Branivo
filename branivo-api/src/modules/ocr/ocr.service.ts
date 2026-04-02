import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { OcrJobRepository } from './ocr-job.repository';
import { OcrScanRepository } from './ocr-scan.repository';
import {
  GoogleVisionService,
  GoogleVisionTimeoutError,
} from './providers/google-vision.service';
import { AwsTextractService } from './providers/aws-textract.service';
import { OcrQueueProducer } from './ocr-queue.producer';
import {
  OcrField,
  OcrFieldResult,
  OcrJobEntity,
  OcrJobStatus,
  OcrProvider,
} from './entities/ocr-job.entity';
import { OcrScanResponseDto, ReportMlKitScanDto } from './dto/ocr-scan.dto';
import { OcrStatusResponseDto } from './dto/ocr-status.dto';
import { CreateOcrLogDto } from './dto/create-ocr-log.dto';

const OCR_RATE_LIMIT = 10;
const OCR_RATE_WINDOW_SECONDS = 60;
const SESSION_TTL_SECONDS = 172800; // 48 hours

// Atomically increment a counter and set TTL only on first increment.
// Prevents a key from persisting without expiry if the process crashes
// between INCR and EXPIRE.
const RATE_LIMIT_LUA = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
`;

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly tenantContext: TenantContext,
    private readonly ocrJobRepository: OcrJobRepository,
    private readonly ocrScanRepository: OcrScanRepository,
    private readonly googleVisionService: GoogleVisionService,
    private readonly awsTextractService: AwsTextractService,
    private readonly ocrQueueProducer: OcrQueueProducer,
  ) {}

  async scan(
    images: Buffer[],
    sessionToken: string,
    clientIp: string,
  ): Promise<OcrScanResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    await this.enforceRateLimit(tenantId, clientIp);

    const job = await this.ocrJobRepository.createJob({
      tenantId,
      sessionToken,
      imagesCount: images.length,
    });

    try {
      const visionResult = await this.googleVisionService.analyzeImages(images);
      const avgConfidence = this.calcAvgConfidence(visionResult);

      await this.ocrJobRepository.updateStatus(job.id, OcrJobStatus.COMPLETED, {
        result: visionResult,
        confidenceScores: this.extractConfidenceScores(visionResult),
        provider: OcrProvider.GOOGLE_VISION,
      });

      await this.updateAnonymousSession(
        sessionToken,
        tenantId,
        visionResult,
        job.id,
      );

      return {
        jobId: job.id,
        status: OcrJobStatus.COMPLETED,
        provider: OcrProvider.GOOGLE_VISION,
        fields: visionResult,
        avgConfidence,
      };
    } catch (err) {
      if (err instanceof GoogleVisionTimeoutError) {
        this.logger.warn(
          `Google Vision timeout for job ${job.id} — falling back to Textract`,
        );
      } else {
        this.logger.error(`Google Vision error for job ${job.id}`, err);
      }

      return this.enqueueTextractFallback(job, images, sessionToken);
    }
  }

  async reportMlKitScan(
    dto: ReportMlKitScanDto,
    clientIp: string,
  ): Promise<OcrScanResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    await this.enforceRateLimit(tenantId, clientIp);

    try {
      const job = await this.ocrJobRepository.createJob({
        tenantId,
        sessionToken: dto.session_token,
        imagesCount: dto.images_count,
      });

      const avgConfidence = this.calcAvgConfidence(dto.fields);

      await this.ocrJobRepository.updateStatus(job.id, OcrJobStatus.COMPLETED, {
        result: dto.fields,
        confidenceScores: this.extractConfidenceScores(dto.fields),
        provider: OcrProvider.ML_KIT,
        rawText: dto.raw_text,
      });

      await this.updateAnonymousSession(
        dto.session_token,
        tenantId,
        dto.fields,
        job.id,
      );

      return {
        jobId: job.id,
        status: OcrJobStatus.COMPLETED,
        provider: OcrProvider.ML_KIT,
        fields: dto.fields,
        avgConfidence,
      };
    } catch (err) {
      this.logger.error('Failed to record ML Kit scan', err);
      throw err;
    }
  }

  async getStatus(jobId: string): Promise<OcrStatusResponseDto> {
    const job = await this.ocrJobRepository.findById(jobId);
    if (!job) throw new NotFoundException(`OCR job ${jobId} не е намерен`);

    return {
      jobId: job.id,
      status: job.status,
      provider: job.provider ?? undefined,
      fields: job.result ?? undefined,
      avgConfidence: job.result
        ? this.calcAvgConfidence(job.result)
        : undefined,
    };
  }

  /**
   * POST /api/v1/ocr/log — fire-and-forget analytics logging.
   * raw_text is rejected at the DTO level — never stored.
   */
  async logScan(dto: CreateOcrLogDto): Promise<void> {
    try {
      await this.ocrScanRepository.createScan(dto);
    } catch (err) {
      // Log but don't fail the endpoint — analytics must not break UX
      this.logger.error('Failed to save OCR scan log', err);
    }
  }

  /**
   * POST /api/v1/ocr/vision-scan — server-side Google Vision fallback.
   * Accepts full-res JPEG images; returns structured OCR fields.
   */
  async visionScan(
    images: Buffer[],
    sessionToken: string,
  ): Promise<OcrScanResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const job = await this.ocrJobRepository.createJob({
      tenantId,
      sessionToken,
      imagesCount: images.length,
    });

    try {
      const visionResult = await this.googleVisionService.analyzeImages(images);
      const avgConfidence = this.calcAvgConfidence(visionResult);

      await this.ocrJobRepository.updateStatus(job.id, OcrJobStatus.COMPLETED, {
        result: visionResult,
        confidenceScores: this.extractConfidenceScores(visionResult),
        provider: OcrProvider.GOOGLE_VISION,
      });

      return {
        jobId: job.id,
        status: OcrJobStatus.COMPLETED,
        provider: OcrProvider.GOOGLE_VISION,
        fields: visionResult,
        avgConfidence,
      };
    } catch (err) {
      this.logger.error(`Vision scan error for job ${job.id}`, err);
      await this.ocrJobRepository.updateStatus(job.id, OcrJobStatus.FAILED, {
        errorMessage: 'Google Vision unavailable',
      });
      return { jobId: job.id, status: OcrJobStatus.FAILED };
    }
  }

  private async updateAnonymousSession(
    sessionToken: string,
    tenantId: string,
    ocrResult: OcrFieldResult,
    jobId: string,
  ): Promise<void> {
    const sessionKey = `anon:${sessionToken}:session`;
    const existing = await this.redis.get(sessionKey);
    if (!existing) return;

    try {
      const sessionData = JSON.parse(existing) as Record<string, unknown>;
      sessionData.vehicle_data = {
        ...(sessionData.vehicle_data as Record<string, unknown> | undefined),
        ...ocrResult,
        ocr_job_id: jobId,
        ocr_completed_at: new Date().toISOString(),
      };
      await this.redis.setex(
        sessionKey,
        SESSION_TTL_SECONDS,
        JSON.stringify(sessionData),
      );
    } catch (err) {
      this.logger.error(
        'Failed to update anonymous session with OCR data',
        err,
      );
    }
  }

  private async enforceRateLimit(
    tenantId: string,
    clientIp: string,
  ): Promise<void> {
    const key = `ocr_rate:${tenantId}:${clientIp}`;
    const count = (await this.redis.eval(
      RATE_LIMIT_LUA,
      1,
      key,
      String(OCR_RATE_WINDOW_SECONDS),
    )) as number;
    if (count > OCR_RATE_LIMIT) {
      throw new HttpException(
        {
          message: 'Твърде много заявки. Опитайте след малко.',
          retry_after: OCR_RATE_WINDOW_SECONDS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async enqueueTextractFallback(
    job: OcrJobEntity,
    images: Buffer[],
    sessionToken: string,
  ): Promise<OcrScanResponseDto> {
    const tenantId = this.tenantContext.getTenantId();
    try {
      const { bucket, keys } = await this.awsTextractService.uploadImagesToS3(
        images,
        tenantId,
        job.id,
      );

      // Enqueue a separate Textract analysis job for each uploaded image so
      // that all pages of a multi-page document are analysed.
      // The queue worker updates this ocr_job record on completion; the last
      // image to finish wins (acceptable for single-page talons — merge logic
      // can be added to the worker in a future iteration).
      await Promise.all(
        keys.map(async (key) => {
          const textractJobId = await this.awsTextractService.startAnalysis(
            bucket,
            key,
          );
          await this.ocrQueueProducer.enqueueTextractJob({
            jobId: job.id,
            tenantId,
            textractJobId,
            sessionToken,
            s3Bucket: bucket,
            s3Keys: [key],
          });
        }),
      );

      return { jobId: job.id, status: OcrJobStatus.PROCESSING };
    } catch (err) {
      this.logger.error(`Textract enqueue failed for job ${job.id}`, err);
      await this.ocrJobRepository.updateStatus(job.id, OcrJobStatus.FAILED, {
        errorMessage: 'OCR service unavailable',
      });
      return { jobId: job.id, status: OcrJobStatus.FAILED };
    }
  }

  private calcAvgConfidence(fields: OcrFieldResult): number {
    const values = Object.values(fields)
      .map((f: OcrField | undefined) => f?.confidence ?? null)
      .filter((c): c is number => c !== null);
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private extractConfidenceScores(
    fields: OcrFieldResult,
  ): Record<string, number> {
    return Object.fromEntries(
      Object.entries(fields).map(
        ([k, v]: [string, OcrField | undefined]) =>
          [k, v?.confidence ?? 0] as [string, number],
      ),
    );
  }
}
