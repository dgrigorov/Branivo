import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bull';
import { from, interval, Observable } from 'rxjs';
import { mergeMap, switchMap, takeWhile } from 'rxjs/operators';
import { Repository } from 'typeorm';
import { QUEUE_VEHICLE_CATALOG_SYNC } from '../../infrastructure/queues/queue.module';
import {
  SyncRunStatus,
  VehicleCatalogSyncRunEntity,
} from './entities/vehicle-catalog-sync-run.entity';

export interface SyncRunDto {
  id: string;
  status: SyncRunStatus;
  totalScraped: number | null;
  totalImported: number | null;
  errorMessage: string | null;
  logLines: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface SyncProgressEvent {
  type: 'log' | 'status' | 'done';
  line?: string;
  status?: SyncRunStatus;
  totalScraped?: number | null;
  totalImported?: number | null;
}

@Injectable()
export class VehicleCatalogSyncService {
  private readonly logger = new Logger(VehicleCatalogSyncService.name);

  constructor(
    @InjectRepository(VehicleCatalogSyncRunEntity)
    private readonly runRepo: Repository<VehicleCatalogSyncRunEntity>,
    @InjectQueue(QUEUE_VEHICLE_CATALOG_SYNC)
    private readonly syncQueue: Queue,
  ) {}

  async startSync(): Promise<SyncRunDto> {
    const active = await this.runRepo.findOne({
      where: [
        { status: 'pending' },
        { status: 'scraping' },
        { status: 'importing' },
      ],
      order: { createdAt: 'DESC' },
    });
    if (active) {
      throw new ConflictException(
        `Sync вече тече (runId: ${active.id}, status: ${active.status})`,
      );
    }

    const run = this.runRepo.create({ status: 'pending', logLines: [] });
    const saved = await this.runRepo.save(run);

    await this.syncQueue.add(
      'vehicle-catalog:sync',
      { runId: saved.id },
      { attempts: 1, removeOnComplete: 50, removeOnFail: 200 },
    );

    this.logger.log(`Sync run ${saved.id} enqueued`);
    return this.toDto(saved);
  }

  /** Creates a run record for import-only (no scrape phase). */
  async startImportOnlyRun(): Promise<SyncRunDto> {
    const run = this.runRepo.create({ status: 'importing', logLines: [] });
    const saved = await this.runRepo.save(run);
    return this.toDto(saved);
  }

  async getStatus(): Promise<SyncRunDto | null> {
    const run = await this.runRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });
    return run ? this.toDto(run) : null;
  }

  async getRunById(runId: string): Promise<VehicleCatalogSyncRunEntity> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException(`Sync run ${runId} не е намерен`);
    return run;
  }

  /** Called by the processor to append a single log line. */
  async appendLog(runId: string, line: string): Promise<void> {
    await this.runRepo.query(
      `UPDATE vehicle_catalog_sync_runs
       SET log_lines = array_append(log_lines, $1), updated_at = now()
       WHERE id = $2`,
      [line, runId],
    );
  }

  async updateStatus(
    runId: string,
    status: SyncRunStatus,
    extra?: {
      totalScraped?: number;
      totalImported?: number;
      errorMessage?: string;
    },
  ): Promise<void> {
    const patch: Partial<VehicleCatalogSyncRunEntity> = { status };
    if (status === 'done' || status === 'failed') {
      patch.completedAt = new Date();
    }
    if (extra?.totalScraped !== undefined)
      patch.totalScraped = extra.totalScraped;
    if (extra?.totalImported !== undefined)
      patch.totalImported = extra.totalImported;
    if (extra?.errorMessage !== undefined)
      patch.errorMessage = extra.errorMessage;
    await this.runRepo.update(runId, patch);
  }

  /** SSE stream: polls DB every second and emits new log lines. */
  streamProgress(runId: string): Observable<MessageEvent> {
    let lastIndex = 0;
    const terminal: SyncRunStatus[] = ['done', 'failed'];

    return interval(1000).pipe(
      switchMap(async () => {
        const run = await this.runRepo.findOne({ where: { id: runId } });
        if (!run)
          return {
            newLines: [] as string[],
            status: 'failed' as SyncRunStatus,
            done: true,
          };
        const newLines = run.logLines.slice(lastIndex);
        lastIndex += newLines.length;
        const done = terminal.includes(run.status) && newLines.length === 0;
        return {
          newLines,
          status: run.status,
          totalScraped: run.totalScraped,
          totalImported: run.totalImported,
          done,
        };
      }),
      takeWhile((r) => !r.done, true),
      mergeMap((r) => {
        const events: MessageEvent[] = r.newLines.map(
          (line) =>
            ({
              data: JSON.stringify({
                type: 'log',
                line,
              } satisfies SyncProgressEvent),
            }) as MessageEvent,
        );
        if (r.done) {
          events.push({
            data: JSON.stringify({
              type: 'done',
              status: r.status,
              totalScraped: r.totalScraped,
              totalImported: r.totalImported,
            } satisfies SyncProgressEvent),
          } as MessageEvent);
        } else if (r.newLines.length === 0) {
          events.push({
            data: JSON.stringify({
              type: 'status',
              status: r.status,
            } satisfies SyncProgressEvent),
          } as MessageEvent);
        }
        return from(events);
      }),
    );
  }

  private toDto(run: VehicleCatalogSyncRunEntity): SyncRunDto {
    return {
      id: run.id,
      status: run.status,
      totalScraped: run.totalScraped,
      totalImported: run.totalImported,
      errorMessage: run.errorMessage,
      logLines: run.logLines,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    };
  }
}
