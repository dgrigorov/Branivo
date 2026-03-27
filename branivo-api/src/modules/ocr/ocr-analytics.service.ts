import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { EmailService } from '../../common/email/email.service';
import type {
  OcrAnalyticsFiltersDto,
  OcrAnalyticsResponseDto,
  OcrFieldDto,
  OcrFieldResultDto,
  OcrFieldStat,
  OcrSessionDto,
  OcrSessionFiltersDto,
  OcrSessionsResponseDto,
  OcrTrendPoint,
} from './dto/ocr-analytics.dto';

type RawOcrField = {
  value: string | null;
  confidence: number;
  auto_filled: boolean;
};
type RawOcrResult = Record<string, RawOcrField>;

interface RawOcrSession {
  id: string;
  session_token: string;
  tenant_id: string;
  provider: string | null;
  status: string;
  images_count: number;
  result: RawOcrResult | null;
  confidence_scores: Record<string, number> | null;
  created_at: Date;
  total_count: string;
}

interface RawOcrStat {
  field_name: string;
  avg_confidence: string;
  fallback_rate: string;
  total_jobs: string;
}

interface RawOcrTrend {
  date: Date;
  avg_confidence: string;
  fallback_rate: string;
  total_jobs: string;
}

@Injectable()
export class OcrAnalyticsService {
  private readonly logger = new Logger(OcrAnalyticsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getAnalytics(
    filters: OcrAnalyticsFiltersDto,
  ): Promise<OcrAnalyticsResponseDto> {
    const days = filters.days ?? 7;
    const params: (string | number)[] = [days];
    let tenantFilter = '';
    if (filters.tenantId) {
      params.push(filters.tenantId);
      tenantFilter = `AND tenant_id = $${params.length}`;
    }

    const rows = await this.dataSource.query<RawOcrStat[]>(
      `
      SELECT
        key AS field_name,
        AVG((confidence_scores->>key)::float) AS avg_confidence,
        COUNT(*) FILTER (WHERE provider = 'aws_textract')::float / COUNT(*) AS fallback_rate,
        COUNT(*) AS total_jobs
      FROM ocr_jobs,
           jsonb_object_keys(confidence_scores) AS key
      WHERE status = 'completed'
        AND created_at >= NOW() - make_interval(days => $1::int)
        ${tenantFilter}
        AND deleted_at IS NULL
      GROUP BY key
      ORDER BY key
    `,
      params,
    );

    const stats: OcrFieldStat[] = rows.map((r) => ({
      fieldName: r.field_name,
      avgConfidence: parseFloat(r.avg_confidence),
      fallbackRate: parseFloat(r.fallback_rate),
      totalJobs: parseInt(r.total_jobs, 10),
    }));

    return {
      stats,
      tenantId: filters.tenantId,
      days,
      generatedAt: new Date().toISOString(),
    };
  }

  async getTrend(
    field: string,
    days: 7 | 30 = 7,
    tenantId?: string,
  ): Promise<OcrTrendPoint[]> {
    const params: (string | number)[] = [field, days];
    let tenantFilter = '';
    if (tenantId) {
      params.push(tenantId);
      tenantFilter = `AND tenant_id = $${params.length}`;
    }

    const rows = await this.dataSource.query<RawOcrTrend[]>(
      `
      SELECT
        DATE_TRUNC('day', created_at) AS date,
        AVG((confidence_scores->>$1)::float) AS avg_confidence,
        COUNT(*) FILTER (WHERE provider = 'aws_textract')::float / COUNT(*) AS fallback_rate,
        COUNT(*) AS total_jobs
      FROM ocr_jobs
      WHERE status = 'completed'
        AND confidence_scores ? $1
        AND created_at >= NOW() - make_interval(days => $2::int)
        AND deleted_at IS NULL
        ${tenantFilter}
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `,
      params,
    );

    return rows.map((r) => ({
      date: new Date(r.date).toISOString().split('T')[0] ?? '',
      avgConfidence: parseFloat(r.avg_confidence),
      fallbackRate: parseFloat(r.fallback_rate),
      totalJobs: parseInt(r.total_jobs, 10),
    }));
  }

  async getSessions(
    filters: OcrSessionFiltersDto,
  ): Promise<OcrSessionsResponseDto> {
    const days = filters.days ?? 7;
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 25;
    const offset = (page - 1) * limit;
    const params: (string | number)[] = [days, limit, offset];
    let tenantFilter = '';
    if (filters.tenantId) {
      params.push(filters.tenantId);
      tenantFilter = `AND tenant_id = $${params.length}`;
    }
    const rows = await this.dataSource.query<RawOcrSession[]>(
      `SELECT id, session_token, tenant_id, provider, status, images_count,
              result, confidence_scores, created_at,
              COUNT(*) OVER() AS total_count
       FROM ocr_jobs
       WHERE status = 'completed'
         AND created_at >= NOW() - make_interval(days => $1::int)
         AND deleted_at IS NULL
         ${tenantFilter}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      params,
    );
    const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
    return {
      sessions: rows.map((r) => this.mapRawSession(r)),
      total,
      page,
      limit,
    };
  }

  private mapRawSession(row: RawOcrSession): OcrSessionDto {
    return {
      id: row.id,
      sessionToken: row.session_token,
      tenantId: row.tenant_id,
      provider: row.provider,
      status: row.status,
      imagesCount: row.images_count,
      result: row.result ? this.mapRawResult(row.result) : null,
      confidenceScores: row.confidence_scores,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private mapRawResult(raw: RawOcrResult): OcrFieldResultDto {
    const result: OcrFieldResultDto = {};
    for (const [key, field] of Object.entries(raw)) {
      const typedKey = key as keyof OcrFieldResultDto;
      const mapped: OcrFieldDto = {
        value: field.value,
        confidence: field.confidence,
        autoFilled: field.auto_filled,
      };
      (result as Record<string, OcrFieldDto>)[typedKey] = mapped;
    }
    return result;
  }

  async checkAndSendAlerts(): Promise<void> {
    const superAdminEmail = this.config.get<string>(
      'SUPER_ADMIN_ALERT_EMAIL',
      'admin@branivo.bg',
    );

    const rows = await this.dataSource.query<
      Array<{
        field_name: string;
        tenant_id: string;
        fallback_rate: string;
      }>
    >(`
      SELECT
        key AS field_name,
        tenant_id,
        COUNT(*) FILTER (WHERE provider = 'aws_textract')::float / COUNT(*) AS fallback_rate
      FROM ocr_jobs,
           jsonb_object_keys(confidence_scores) AS key
      WHERE status = 'completed'
        AND created_at >= NOW() - INTERVAL '1 day'
        AND deleted_at IS NULL
      GROUP BY key, tenant_id
      HAVING COUNT(*) FILTER (WHERE provider = 'aws_textract')::float / COUNT(*) > 0.20
    `);

    for (const row of rows) {
      const alertKey = `ocr_alert:${row.tenant_id}:${row.field_name}`;
      const alreadySent = await this.redis.exists(alertKey);
      if (alreadySent) continue;

      const fallbackRate = parseFloat(row.fallback_rate);
      try {
        await this.emailService.sendOcrAlertEmail(
          superAdminEmail,
          row.field_name,
          fallbackRate,
          row.tenant_id,
        );
        await this.redis.setex(alertKey, 3600, '1');
      } catch (err) {
        this.logger.error(
          `Failed to send OCR alert for field=${row.field_name} tenant=${row.tenant_id}`,
          err,
        );
      }
    }
  }

  @Cron('0 * * * *')
  async handleOcrAlertCheck(): Promise<void> {
    await this.checkAndSendAlerts();
  }
}
