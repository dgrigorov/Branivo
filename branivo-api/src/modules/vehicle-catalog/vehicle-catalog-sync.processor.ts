import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { spawn } from 'child_process';
import * as path from 'path';
import { QUEUE_VEHICLE_CATALOG_SYNC } from '../../infrastructure/queues/queue.module';
import { VehicleCatalogImportService } from './vehicle-catalog-import.service';
import { VehicleCatalogSyncService } from './vehicle-catalog-sync.service';

export interface SyncJobData {
  runId: string;
}

const SCRIPTS_ROOT = path.resolve(process.cwd(), '..', 'scripts');
const TSCONFIG = path.resolve(process.cwd(), '..', 'tsconfig.scripts.json');

/** Lines matching these patterns are logged; all others (e.g. "Total: N") are dropped. */
const LOG_PATTERNS = [
  /^\[brand\]/i,
  /^\[model\]/i,
  /^\[gen\]/i,
  /saved\s+\d+/i,
  /checkpoint/i,
  /error/i,
  /^\s*✅/,
  /^\s*✓/,
  /^\s*▶/,
  /^\s*❌/,
  /\[stderr\]/,
];

function isSignificant(line: string): boolean {
  return LOG_PATTERNS.some((re) => re.test(line));
}

@Processor(QUEUE_VEHICLE_CATALOG_SYNC)
export class VehicleCatalogSyncProcessor {
  private readonly logger = new Logger(VehicleCatalogSyncProcessor.name);

  constructor(
    private readonly syncService: VehicleCatalogSyncService,
    private readonly importService: VehicleCatalogImportService,
  ) {}

  @Process('vehicle-catalog:sync')
  async handleSync(job: Job<SyncJobData>): Promise<void> {
    const { runId } = job.data;
    this.logger.log(`Sync run ${runId} started`);

    try {
      // ── Phase 1: Scrape ──────────────────────────────────────────────────
      await this.syncService.updateStatus(runId, 'scraping');
      await this.syncService.appendLog(
        runId,
        '▶ Фаза 1/2: Скрейпване на bg.autodata24.com...',
      );

      const scrapedCount = await this.runScraper(runId);

      await this.syncService.appendLog(
        runId,
        `✓ Скрейпването завърши. Общо модификации: ${scrapedCount.toLocaleString()}`,
      );
      await this.syncService.updateStatus(runId, 'importing', {
        totalScraped: scrapedCount,
      });

      // ── Phase 2: Import (direct TypeORM — no HTTP) ───────────────────────
      await this.syncService.appendLog(
        runId,
        '▶ Фаза 2/2: Bulk import в базата данни...',
      );
      const importedCount = await this.importService.importFromJson(runId);

      await this.syncService.updateStatus(runId, 'done', {
        totalScraped: scrapedCount,
        totalImported: importedCount,
      });
      await this.syncService.appendLog(
        runId,
        `✅ Готово! Скрейпнати: ${scrapedCount.toLocaleString()}, Импортирани: ${importedCount.toLocaleString()}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sync run ${runId} failed: ${message}`);
      await this.syncService.updateStatus(runId, 'failed', {
        errorMessage: message,
      });
      await this.syncService.appendLog(runId, `❌ Грешка: ${message}`);
      throw err;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<SyncJobData>, err: Error): void {
    this.logger.error(
      `Job ${job.id} (runId: ${job.data.runId}) failed: ${err.message}`,
    );
  }

  private runScraper(runId: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(SCRIPTS_ROOT, 'autodata24-scraper.ts');
      const env: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => e[1] !== undefined,
        ),
      );

      const child = spawn(
        'npx',
        ['ts-node', '--project', TSCONFIG, scriptPath],
        {
          env,
          cwd: path.resolve(process.cwd(), '..'),
        },
      );

      let lastTotal = 0;
      let stdoutBuf = '';
      let stderrBuf = '';

      const handleLine = (line: string): void => {
        // Extract running total from any line
        const m = /Total:\s*(\d+)/i.exec(line);
        if (m) {
          lastTotal = parseInt(m[1], 10);
          return;
        }
        // Only log significant lines
        if (isSignificant(line)) {
          void this.syncService.appendLog(runId, line.trim());
        }
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop() ?? '';
        lines.forEach(handleLine);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        const lines = stderrBuf.split('\n');
        stderrBuf = lines.pop() ?? '';
        lines
          .filter((l) => l.trim())
          .forEach((l) => handleLine(`[stderr] ${l}`));
      });

      child.on('close', (code) => {
        if (stdoutBuf.trim()) handleLine(stdoutBuf);
        if (stderrBuf.trim()) handleLine(`[stderr] ${stderrBuf}`);
        if (code === 0) resolve(lastTotal);
        else reject(new Error(`Scraper завърши с код ${code ?? 'unknown'}`));
      });

      child.on('error', reject);
    });
  }
}
