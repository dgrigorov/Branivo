import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { ILike, Repository } from 'typeorm';
import { FSC_CATEGORIES } from './insurers.constants';
import { FscInsurerQueryDto, FscSyncResponseDto } from './dto/fsc-insurer.dto';
import { FscInsurerEntity } from './entities/fsc-insurer.entity';
import { FscScraperService } from './fsc-scraper.service';
import { TrustpilotEnricherService } from './trustpilot-enricher.service';
import {
  FscSyncStatus,
  SyncLogLevel,
  WebsiteEnrichment,
} from './insurers.types';

@Injectable()
export class InsurersService {
  private readonly logger = new Logger(InsurersService.name);
  private latestSyncStatus: FscSyncStatus = {
    runId: null,
    status: 'idle',
    startedAt: null,
    finishedAt: null,
    total: null,
    byCategory: [],
    errorMessage: null,
    logs: [],
  };
  private activeSyncPromise: Promise<FscSyncResponseDto> | null = null;

  constructor(
    @InjectRepository(FscInsurerEntity)
    private readonly repo: Repository<FscInsurerEntity>,
    private readonly config: ConfigService,
    private readonly scraper: FscScraperService,
    private readonly trustpilot: TrustpilotEnricherService,
  ) {}

  async syncFromFsc(): Promise<FscSyncResponseDto> {
    if (this.activeSyncPromise) {
      this.pushSyncLog(
        'warn',
        'FSC sync вече е стартиран. Изчакване на текущия run.',
      );
      return this.activeSyncPromise;
    }

    const runId = randomUUID();
    this.latestSyncStatus = {
      runId,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      total: null,
      byCategory: [],
      errorMessage: null,
      logs: [],
    };
    this.pushSyncLog('info', `FSC sync start (runId: ${runId})`);

    this.activeSyncPromise = this.doSyncFromFsc();
    return this.activeSyncPromise.finally(() => {
      this.activeSyncPromise = null;
    });
  }

  getSyncStatus(): FscSyncStatus {
    return this.latestSyncStatus;
  }

  async enrichTrustpilotAll(): Promise<{
    enriched: number;
    failed: number;
    skipped: number;
  }> {
    return this.trustpilot.enrichAll();
  }

  async list(query: FscInsurerQueryDto): Promise<FscInsurerEntity[]> {
    const where: Record<string, unknown>[] = [];
    const limit = query.limit ?? 500;

    if (query.q) {
      const q = `%${query.q}%`;
      if (query.categoryKey) {
        where.push(
          { categoryKey: query.categoryKey, name: ILike(q) },
          { categoryKey: query.categoryKey, eik: ILike(q) },
        );
      } else {
        where.push({ name: ILike(q) }, { eik: ILike(q) });
      }
    } else if (query.categoryKey) {
      where.push({ categoryKey: query.categoryKey });
    }

    return this.repo.find({
      where: where.length > 0 ? where : undefined,
      take: limit,
      order: { categoryLabel: 'ASC', name: 'ASC' },
    });
  }

  private async doSyncFromFsc(): Promise<FscSyncResponseDto> {
    const now = new Date();
    const byCategory: FscSyncResponseDto['byCategory'] = [];
    let total = 0;
    const enrichmentCache = new Map<string, WebsiteEnrichment>();

    try {
      for (const category of FSC_CATEGORIES) {
        this.pushSyncLog(
          'info',
          `Обхождане на категория "${category.label}" (${category.key})`,
        );
        const rows = await this.scraper.scrapeCategory(category.url);

        if (rows.length === 0) {
          const msg = `FSC scrape returned 0 rows for ${category.key} (${category.url}). Keeping previous data.`;
          this.logger.warn(msg);
          this.pushSyncLog('warn', msg);
          byCategory.push({
            categoryKey: category.key,
            categoryLabel: category.label,
            url: category.url,
            imported: 0,
          });
          continue;
        }

        this.pushSyncLog(
          'info',
          `Категория "${category.label}": scraped ${rows.length} реда`,
        );
        await this.syncSingleCategory({
          category,
          rows,
          enrichmentCache,
          now,
          byCategory,
        });
        total += byCategory[byCategory.length - 1]?.imported ?? 0;
      }

      const result: FscSyncResponseDto = {
        total,
        byCategory,
        syncedAt: now.toISOString(),
      };
      this.latestSyncStatus = {
        ...this.latestSyncStatus,
        status: 'success',
        total,
        byCategory,
        finishedAt: new Date().toISOString(),
        errorMessage: null,
      };
      this.pushSyncLog('info', `FSC sync success. Общо импортирани: ${total}`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.latestSyncStatus = {
        ...this.latestSyncStatus,
        status: 'error',
        finishedAt: new Date().toISOString(),
        errorMessage: message,
        total,
        byCategory,
      };
      this.pushSyncLog('error', `FSC sync failed: ${message}`);
      this.logger.error(
        'FSC sync failed',
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }

  private async syncSingleCategory(params: {
    category: (typeof FSC_CATEGORIES)[number];
    rows: Awaited<ReturnType<FscScraperService['scrapeCategory']>>;
    enrichmentCache: Map<string, WebsiteEnrichment>;
    now: Date;
    byCategory: FscSyncResponseDto['byCategory'];
  }): Promise<void> {
    const { category, rows, enrichmentCache, now, byCategory } = params;

    const enrichedRows = await this.scraper.enrichRows(rows, enrichmentCache);
    const dedupedRows = this.scraper.deduplicateRows(enrichedRows);
    const existing = await this.repo.find({
      where: { categoryKey: category.key },
    });
    const existingByKey = new Map<string, FscInsurerEntity>();
    for (const row of existing) {
      existingByKey.set(this.scraper.getDedupKey(row.name, row.eik), row);
    }

    const entities = dedupedRows.map((r) =>
      this.scraper.buildMergedEntity({
        existing: existingByKey.get(this.scraper.getDedupKey(r.name, r.eik)),
        scraped: r,
        categoryKey: category.key,
        categoryLabel: category.label,
        sourceUrl: category.url,
        now,
      }),
    );

    if (entities.length > 0) await this.repo.save(entities);

    byCategory.push({
      categoryKey: category.key,
      categoryLabel: category.label,
      url: category.url,
      imported: entities.length,
    });
    this.pushSyncLog(
      'info',
      `Категория "${category.label}": записани ${entities.length} реда`,
    );
  }

  private pushSyncLog(level: SyncLogLevel, message: string): void {
    const logs = [
      ...this.latestSyncStatus.logs,
      { at: new Date().toISOString(), level, message },
    ];
    this.latestSyncStatus = {
      ...this.latestSyncStatus,
      logs: logs.slice(-400),
    };
  }

  @Cron('0 3 * * *', { timeZone: 'Europe/Sofia' })
  async handleDailySync(): Promise<void> {
    const enabled =
      this.config.get<string>('FSC_AUTO_SYNC_ENABLED', 'true') !== 'false';
    if (!enabled) return;

    try {
      const result = await this.syncFromFsc();
      this.logger.log(
        `FSC daily sync completed: total=${result.total}, categories=${result.byCategory.length}`,
      );
    } catch (err) {
      this.logger.error('FSC daily sync failed', err);
    }
  }
}
