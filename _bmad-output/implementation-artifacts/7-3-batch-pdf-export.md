# Story 7.3: Batch PDF Export

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Fleet Admin,
I want to export policy documents for multiple vehicles in a single archive,
So that I can efficiently manage and distribute fleet insurance documentation.

## Acceptance Criteria

1. **AC1 — BullMQ queue per полица с progress indicator:**
   **Given** Fleet Admin избира едно или повече МПС/полици,
   **When** натисне "Изтегли PDF документи",
   **Then** BullMQ jobs се queue-ват в `pdf-generation` queue (job type `generate-batch-pdf`) per полица; в интерфейса се показва progress indicator "X/Y документа генерирани".

2. **AC2 — ZIP архив в S3 с TTL 24h:**
   **Given** всички PDF jobs са завършени,
   **When** ZIP архивът е готов,
   **Then** ZIP архив се качва в S3 с ключ `{tenantId}/fleet/exports/{batchId}/policies.zip`; S3 ключът се запазва в DB с `expires_at = NOW() + 24h`; Fleet Admin получава in-app notification + имейл.

3. **AC3 — Signed URL с TTL 15 мин:**
   **Given** Fleet Admin натисне download линк,
   **When** заявката е изпратена,
   **Then** presigned S3 URL с TTL 15 минути се генерира on-demand от съхранения S3 ключ — директен S3 достъп е забранен.

4. **AC4 — Хоризонтално скалиране на workers (NFR27):**
   **Given** batch съдържа много МПС,
   **When** BullMQ workers обработват jobs,
   **Then** всеки job е самостоятелен и независим — workers могат да се скалират хоризонтално без координация.

5. **AC5 — Partial success + retry:**
   **Given** individual PDF job се проваля (timeout, insurer API error),
   **When** останалите jobs са завършени,
   **Then** ZIP архивът се генерира с наличните документи; failed документите са изброени с retry опция; batch статусът е `partial` (не `failed`).

6. **AC6 — Feature flag guard:**
   **Given** `features.fleet` е деактивиран за тенанта,
   **When** Fleet Admin се опита да достъпи batch export endpoints,
   **Then** получава `404 Not Found`.

7. **AC7 — Tenant isolation:**
   **Given** Fleet Admin е логнат,
   **When** batch export заявка е изпратена с policyIds,
   **Then** само полици от собствения тенант могат да бъдат включени — `tenant_id` scope задължително.

8. **AC8 — Изтекъл архив:**
   **Given** `expires_at` е преминало (>24h),
   **When** Fleet Admin се опита да генерира download URL,
   **Then** получава `410 Gone` с message "Export has expired. Please generate a new batch export."

## Tasks / Subtasks

### Backend — Migration

- [x] **Task 1: Нова TypeORM migration `fleet_pdf_exports`** (AC: #1, #2, #3, #5, #7)
  - [ ] Файл: `branivo-api/src/infrastructure/database/migrations/1710000027000-CreateFleetPdfExports.ts`
  - [ ] `up()` — CREATE TABLE:
    ```sql
    CREATE TABLE fleet_pdf_exports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      requested_by UUID NOT NULL REFERENCES users(id),
      policy_ids JSONB NOT NULL,           -- string[] от policy UUIDs
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
        -- 'pending' | 'processing' | 'completed' | 'partial' | 'failed'
      total_count INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      failed_policy_ids JSONB NOT NULL DEFAULT '[]',  -- failed policy UUIDs с error
      zip_s3_key VARCHAR(500) NULL,
      expires_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL
    );
    CREATE INDEX idx_fleet_pdf_exports_tenant_id ON fleet_pdf_exports(tenant_id);
    CREATE INDEX idx_fleet_pdf_exports_status ON fleet_pdf_exports(status);
    ```
  - [ ] `down()` — DROP TABLE fleet_pdf_exports;

### Backend — Entity и DTOs

- [x] **Task 2: `FleetPdfExport` entity** (AC: #1-#5, #7)
  - [ ] Файл: `branivo-api/src/modules/fleet/entities/fleet-pdf-export.entity.ts` (new)
  - [ ] `@Entity('fleet_pdf_exports')` extends `BaseEntity`
  - [ ] Полета:
    ```typescript
    @Column({ name: 'tenant_id' }) tenantId: string;
    @Column({ name: 'requested_by' }) requestedBy: string;
    @Column({ name: 'policy_ids', type: 'jsonb' }) policyIds: string[];
    @Column({ name: 'status' }) status: FleetPdfExportStatus;
    @Column({ name: 'total_count' }) totalCount: number;
    @Column({ name: 'completed_count' }) completedCount: number;
    @Column({ name: 'failed_count' }) failedCount: number;
    @Column({ name: 'failed_policy_ids', type: 'jsonb' }) failedPolicyIds: FleetPdfFailedItem[];
    @Column({ name: 'zip_s3_key', nullable: true }) zipS3Key: string | null;
    @Column({ name: 'expires_at', nullable: true }) expiresAt: Date | null;
    ```
  - [ ] Enum: `export enum FleetPdfExportStatus { PENDING = 'pending', PROCESSING = 'processing', COMPLETED = 'completed', PARTIAL = 'partial', FAILED = 'failed' }`
  - [ ] Interface: `interface FleetPdfFailedItem { policyId: string; error: string; }`

- [x] **Task 3: DTOs** (AC: #1-#5, #8)
  - [ ] Файл: `branivo-api/src/modules/fleet/dto/batch-export-request.dto.ts` (new)
    - `policyIds: string[]` с `@IsArray() @ArrayNotEmpty() @IsUUID('4', { each: true }) @ArrayMaxSize(50)`
  - [ ] Файл: `branivo-api/src/modules/fleet/dto/batch-export-response.dto.ts` (new)
    - `exportId: string`, `status: FleetPdfExportStatus`, `totalCount: number`, `completedCount: number`, `failedCount: number`, `failedPolicyIds: FleetPdfFailedItem[]`, `zipS3Key: string | null`, `expiresAt: Date | null`
    - Decorated с `@ApiProperty()` за всяко поле
  - [ ] Файл: `branivo-api/src/modules/fleet/dto/batch-export-download.dto.ts` (new)
    - `downloadUrl: string`, `expiresInSeconds: number`

### Backend — BullMQ Job Types

- [x] **Task 4: Дефинирай BullMQ job payload types** (AC: #1, #4)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet-pdf-export.types.ts` (new)
    ```typescript
    export interface BatchPdfJobPayload {
      exportId: string;
      policyId: string;
      tenantId: string;
    }
    export interface BatchPdfAssemblePayload {
      exportId: string;
      tenantId: string;
    }
    ```
  - [ ] Job names: `'generate-batch-pdf'` (per policy) и `'assemble-batch-zip'` (финален assembly)

### Backend — Service

- [x] **Task 5: `FleetPdfExportService`** (AC: #1-#5, #7, #8)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet-pdf-export.service.ts` (new)
  - [ ] Инжектирай: `FleetPdfExportRepository`, `PoliciesRepository`, `TenantContext`, `@InjectQueue(QUEUE_PDF_GENERATION) pdfQueue: Queue`, `AwsS3Service`, `NotificationsService`
  - [ ] **`createBatchExport(policyIds: string[]): Promise<BatchExportResponseDto>`**
    - `tenantId = TenantContext.getTenantId()`
    - Verify policies принадлежат на тенанта: `PoliciesRepository.findManyByIds(tenantId, policyIds)` — само намерените (tenant-scoped) да влязат в batch-а
    - Създай `fleet_pdf_exports` record: `status = 'pending'`, `totalCount = validPolicyIds.length`
    - Queue BullMQ jobs: `Promise.all(validPolicyIds.map(policyId => pdfQueue.add('generate-batch-pdf', { exportId, policyId, tenantId }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, jobId: \`batch-pdf-${exportId}-${policyId}\` })))`
    - Update status `→ 'processing'`
    - Върни `BatchExportResponseDto`
  - [ ] **`getExportStatus(exportId: string): Promise<BatchExportResponseDto>`**
    - Load from DB; verify `tenantId` ownership (tenant isolation)
    - Map to `BatchExportResponseDto`
  - [ ] **`getDownloadUrl(exportId: string): Promise<BatchExportDownloadDto>`**
    - Load export; verify tenant ownership
    - Ако `status !== 'completed' && status !== 'partial'` → throw `BadRequestException('Export not ready')`
    - Ако `expiresAt && expiresAt < new Date()` → throw `GoneException('Export has expired')`
    - Генерирай presigned URL: `AwsS3Service.generatePresignedUrl(zipS3Key, 900)` (15 мин = 900 сек)
    - Върни `{ downloadUrl, expiresInSeconds: 900 }`
  - [ ] **`markPolicyPdfComplete(exportId: string, policyId: string, pdfS3Key: string): Promise<void>`** (извиква се от processor)
    - Increment `completedCount`, update status
    - Ако `completedCount + failedCount === totalCount` → извикай `assembleBatchZip(exportId)`
  - [ ] **`markPolicyPdfFailed(exportId: string, policyId: string, error: string): Promise<void>`** (извиква се от processor)
    - Increment `failedCount`, append to `failedPolicyIds`
    - Ако `completedCount + failedCount === totalCount` → извикай `assembleBatchZip(exportId)`
  - [ ] **`assembleBatchZip(exportId: string): Promise<void>`** (private)
    - Ако `completedCount === 0` → update status `→ 'failed'`, send failure notification, return
    - Download всички completed PDFs от S3 (паралелно с `Promise.all`)
    - Създай ZIP архив с `archiver` (npm package):
      ```typescript
      const archive = archiver('zip', { zlib: { level: 9 } });
      completedPdfs.forEach(({ policyId, buffer }) => {
        archive.append(buffer, { name: `policy-${policyId}.pdf` });
      });
      await archive.finalize();
      ```
    - Upload ZIP към S3: `{tenantId}/fleet/exports/{exportId}/policies.zip`
    - Update record: `zipS3Key`, `expiresAt = NOW() + 24h`, `status = completedCount === totalCount ? 'completed' : 'partial'`
    - Изпрати notification: `NotificationsService.sendInAppAndEmail(tenantId, requestedBy, 'fleet.export.ready', { exportId, failedCount })`

### Backend — Repository

- [x] **Task 6: `FleetPdfExportRepository`** (AC: #7)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet-pdf-export.repository.ts` (new)
  - [ ] `extends BaseRepository<FleetPdfExport>`
  - [ ] `findByIdAndTenant(id: string, tenantId: string): Promise<FleetPdfExport | null>` — задължителен tenant_id scope
  - [ ] `incrementCompleted(id: string): Promise<void>` — атомарен UPDATE ... SET completed_count = completed_count + 1
  - [ ] `incrementFailed(id: string, failedItem: FleetPdfFailedItem): Promise<void>` — атомарен UPDATE + jsonb_insert в failed_policy_ids
  - [ ] `updateZipReady(id: string, zipS3Key: string, expiresAt: Date, status: FleetPdfExportStatus): Promise<void>`

### Backend — BullMQ Processor

- [x] **Task 7: `FleetPdfBatchProcessor`** (AC: #1, #4, #5)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet-pdf-batch.processor.ts` (new)
  - [ ] MAX 20 реда — само dispatch!
    ```typescript
    @Processor(QUEUE_PDF_GENERATION)
    export class FleetPdfBatchProcessor {
      constructor(private readonly fleetPdfExportService: FleetPdfExportService) {}

      @Process('generate-batch-pdf')
      async process(job: Job<BatchPdfJobPayload>): Promise<void> {
        await this.fleetPdfExportService.processIndividualPdfJob(job.data);
      }
    }
    ```
  - [ ] `processIndividualPdfJob(payload: BatchPdfJobPayload)` → в `FleetPdfExportService`:
    - Генерирай PDF за `policyId` (reuse `PdfGenerationService.generatePolicyPdf(policyId)`)
    - При success → `markPolicyPdfComplete(exportId, policyId, pdfS3Key)`
    - При failure → `markPolicyPdfFailed(exportId, policyId, error.message)`

### Backend — Controller

- [x] **Task 8: Добави batch export endpoints към `FleetController`** (AC: #1-#3, #6, #8)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet.controller.ts` (modify)
  - [ ] Инжектирай `FleetPdfExportService` в конструктора
  - [ ] `POST /fleet/exports` — създай batch export:
    ```typescript
    @Post('exports')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create batch PDF export for selected policies' })
    @ApiResponse({ status: 201, type: BatchExportResponseDto })
    @ApiResponse({ status: 404, description: 'Fleet feature not enabled' })
    async createBatchExport(@Body() dto: BatchExportRequestDto): Promise<BatchExportResponseDto> {
      return this.fleetPdfExportService.createBatchExport(dto.policyIds);
    }
    ```
  - [ ] `GET /fleet/exports/:exportId` — poll статус:
    ```typescript
    @Get('exports/:exportId')
    @ApiOperation({ summary: 'Get batch export status and progress' })
    @ApiResponse({ status: 200, type: BatchExportResponseDto })
    async getExportStatus(@Param('exportId', ParseUUIDPipe) exportId: string): Promise<BatchExportResponseDto> {
      return this.fleetPdfExportService.getExportStatus(exportId);
    }
    ```
  - [ ] `GET /fleet/exports/:exportId/download` — генерирай signed URL:
    ```typescript
    @Get('exports/:exportId/download')
    @ApiOperation({ summary: 'Generate 15-minute presigned download URL for ZIP' })
    @ApiResponse({ status: 200, type: BatchExportDownloadDto })
    @ApiResponse({ status: 410, description: 'Export has expired' })
    async getDownloadUrl(@Param('exportId', ParseUUIDPipe) exportId: string): Promise<BatchExportDownloadDto> {
      return this.fleetPdfExportService.getDownloadUrl(exportId);
    }
    ```
  - [ ] Съществуващите `@UseGuards`, `@Roles`, `@FeatureFlag` декоратори на class level важат автоматично

### Backend — Module

- [x] **Task 9: Актуализирай `FleetModule`** (AC: #1-#5)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet.module.ts` (modify)
  - [ ] Добави `FleetPdfExport` в `TypeOrmModule.forFeature([...])`
  - [ ] Добави `FleetPdfExportRepository`, `FleetPdfExportService`, `FleetPdfBatchProcessor` в `providers`
  - [ ] Добави `BullModule.registerQueue({ name: QUEUE_PDF_GENERATION })` в `imports` ако не е там
  - [ ] Добави `PoliciesModule` в `imports` (за `PoliciesRepository` и `PdfGenerationService`)
  - [ ] Добави `NotificationsModule` в `imports` (за `NotificationsService`)
  - [ ] Добави `AwsModule` или `AwsS3Service` в `imports`/`providers`

### Backend — Seed

- [x] **Task 10: Добави seed за fleet_pdf_exports** (dev среда)
  - [ ] Файл: `branivo-api/src/infrastructure/database/seed.service.ts` (modify)
  - [ ] Добави `seedFleetPdfExports()`:
    - 1 запис с `status = 'completed'`, `totalCount = 3`, `completedCount = 3`, `failedCount = 0`, `expires_at = NOW() + 24h`, `zip_s3_key = 'demo-tenant/fleet/exports/demo-export-id/policies.zip'`
    - Само ако `NODE_ENV !== 'production'` и само при липса (`ON CONFLICT DO NOTHING`)

### Backend — Тестове

- [x] **Task 11: Unit тест за `FleetPdfExportService`** (AC: #1, #2, #3, #5, #7, #8)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet-pdf-export.service.spec.ts` (new)
  - [ ] Mock: `FleetPdfExportRepository`, `PoliciesRepository`, `Queue`, `AwsS3Service`, `NotificationsService`, `TenantContext`
  - [ ] Тест: `createBatchExport` — policyIds за чужд тенант → пропускат се (tenant isolation)
  - [ ] Тест: `createBatchExport` — queue-ва BullMQ job per valid policy
  - [ ] Тест: `getExportStatus` — wrong tenantId → null (tenant isolation)
  - [ ] Тест: `getDownloadUrl` — status `pending` → `BadRequestException`
  - [ ] Тест: `getDownloadUrl` — `expiresAt` в миналото → `GoneException`
  - [ ] Тест: `getDownloadUrl` — status `completed` → генерира presigned URL
  - [ ] Тест: `assembleBatchZip` — `completedCount = 0` → status `failed`, no ZIP
  - [ ] Тест: `assembleBatchZip` — partial (2 success, 1 failed) → status `partial`, ZIP с 2 PDFs
  - [ ] Тест: `assembleBatchZip` — all success → status `completed`, notification изпратен

- [x] **Task 12: Интеграционен тест за batch export endpoints** (AC: #6, #7)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet.controller.spec.ts` (modify — добави batch export тестове)
  - [ ] `POST /fleet/exports` без feature flag → 404
  - [ ] `POST /fleet/exports` с невалидни UUID → 400
  - [ ] `POST /fleet/exports` с `fleet_admin` роля + feature enabled → 201
  - [ ] `GET /fleet/exports/:id` с чужд tenant → 404 (not found)
  - [ ] `GET /fleet/exports/:id/download` с изтекъл export → 410

### Next.js — Broker Portal

- [x] **Task 13: Export бутон и статус в Fleet Dashboard** (AC: #1, #5)
  - [ ] Файл: `branivo-web/src/app/[locale]/(broker)/fleet/page.tsx` (modify)
  - [ ] Добави "Изтегли документи" бутон в bulk action bar (до съществуващия "Получи оферти" бутон)
  - [ ] onClick → `POST /api/v1/fleet/exports` с `policyIds` (derive от selected vehicles → active policy IDs)
  - [ ] При success → redirect към `/fleet/exports/{exportId}` или show inline progress modal

- [x] **Task 14: `FleetExportStatusPage`** (AC: #1, #2, #3, #5)
  - [ ] Файл: `branivo-web/src/app/[locale]/(broker)/fleet/exports/[exportId]/page.tsx` (new)
  - [ ] `'use client'` — `useQuery` за `GET /api/v1/fleet/exports/:exportId` с `refetchInterval: 2000` докато `status !== 'completed' && status !== 'partial' && status !== 'failed'`
  - [ ] Progress bar: `(completedCount + failedCount) / totalCount * 100%`
  - [ ] Label: `"${completedCount + failedCount} / ${totalCount} документа обработени"`
  - [ ] При `completed` или `partial`:
    - Download бутон: onClick → `GET /api/v1/fleet/exports/:id/download` → redirect към `downloadUrl`
    - Ако `failedCount > 0` → показва списък с failed policies + "Retry" бутон
  - [ ] "Retry" → нов `POST /fleet/exports` само с `failedPolicyIds`

- [x] **Task 15: `FleetExportStatusCard` компонент** (AC: #1-#5)
  - [ ] Файл: `branivo-web/src/components/fleet/FleetExportStatusCard.tsx` (new)
  - [ ] Props: `{ exportId: string, status: FleetPdfExportStatus, totalCount: number, completedCount: number, failedCount: number, failedPolicyIds: FleetPdfFailedItem[] }`
  - [ ] Progress bar + status badge + download бутон (disabled докато processing)
  - [ ] Failed list: policy ID + error + retry checkbox

### Flutter — Fleet App

- [x] **Task 16: Export trigger в `FleetDashboardScreen`** (AC: #1)
  - [ ] Файл: `branivo_app/lib/features/fleet/screens/fleet_dashboard_screen.dart` (modify)
  - [ ] Добави "Изтегли документи" в bottom action bar (до "Оферти" бутона)
  - [ ] При натискане → `FleetExportBloc.add(FleetExportStartedEvent(vehicleIds: _selectedVehicleIds.toList()))`
  - [ ] Navigate към `FleetExportProgressScreen(exportId: ...)`

- [x] **Task 17: `FleetExportBloc`** (AC: #1-#3, #5)
  - [ ] Файл: `branivo_app/lib/features/fleet/bloc/fleet_export_bloc.dart` (new)
  - [ ] Events: `FleetExportStartedEvent(policyIds)`, `FleetExportStatusPolledEvent(exportId)`, `FleetExportDownloadRequestedEvent(exportId)`
  - [ ] States: `FleetExportInitialState`, `FleetExportLoadingState`, `FleetExportProcessingState(progress, export)`, `FleetExportReadyState(downloadUrl, failedCount)`, `FleetExportFailedState(error)`
  - [ ] Polling: `Timer.periodic(Duration(seconds: 2), ...)` → stop при `completed/partial/failed`

- [x] **Task 18: `FleetExportProgressScreen`** (AC: #1-#3, #5)
  - [ ] Файл: `branivo_app/lib/features/fleet/screens/fleet_export_progress_screen.dart` (new)
  - [ ] `BlocBuilder<FleetExportBloc, FleetExportState>` — показва progress
  - [ ] `LinearProgressIndicator` с `value: (completedCount + failedCount) / totalCount`
  - [ ] При `FleetExportReadyState`: `ElevatedButton("Изтегли ZIP")` → отваря `downloadUrl` с `url_launcher`
  - [ ] При `failedCount > 0`: показва failed list с "Retry" бутон

- [x] **Task 19: `FleetExportRepository`** (AC: #1-#3)
  - [ ] Файл: `branivo_app/lib/features/fleet/data/repositories/fleet_export_repository.dart` (new)
  - [ ] `createBatchExport(policyIds: List<String>): Future<FleetExportModel>`
  - [ ] `getExportStatus(exportId: String): Future<FleetExportModel>`
  - [ ] `getDownloadUrl(exportId: String): Future<String>` — връща presigned URL
  - [ ] Модел: `branivo_app/lib/features/fleet/data/models/fleet_export_model.dart` (new)

### Тестове

- [x] **Task 20: Next.js тест за `FleetExportStatusCard`** (AC: #1-#3, #5)
  - [ ] Файл: `branivo-web/src/__tests__/broker/fleet/FleetExportStatusCard.test.tsx` (new)
  - [ ] Тест: показва progress bar при `processing` статус
  - [ ] Тест: download бутон е enabled само при `completed/partial` статус
  - [ ] Тест: failed list е показан само при `failedCount > 0`
  - [ ] Тест: retry бутон е наличен при failed items

- [x] **Task 21: Flutter widget тест за `FleetExportProgressScreen`** (AC: #1-#3)
  - [ ] Файл: `branivo_app/test/features/fleet/screens/fleet_export_progress_screen_test.dart` (new)
  - [ ] Тест: progress bar се рендира с коректна стойност
  - [ ] Тест: download бутон е показан при `FleetExportReadyState`
  - [ ] Тест: failed list е показан при `failedCount > 0`

## Dev Notes

### Ключово Архитектурно Решение — Reuse на Съществуващи Services

**КРИТИЧНО:** Story 7.3 **НЕ** имплементира собствен PDF генератор. Използва директно:
- `PdfGenerationService.generatePolicyPdf(policyId)` — вземи от `PoliciesModule`
- `QUEUE_PDF_GENERATION` — вече дефинирана константа в `queue.module.ts`; **НЕ** дефинирай нова queue

Новото в Story 7.3 е:
1. **Orchestration layer**: Batch tracking в `fleet_pdf_exports` таблица
2. **ZIP assembly**: `archiver` package за комбиниране на генерираните PDFs
3. **Presigned URL**: S3 presigned URL (15 мин) вместо директен S3 достъп
4. **Progress polling**: `GET /fleet/exports/:id` с client-side polling

### BullMQ Processor Architecture

**ВАЖНО:** Съществуващият `PdfGenerationProcessor` (в `policies/`) обработва `'generate-policy-pdf'` jobs. Story 7.3 добавя **нов job type** `'generate-batch-pdf'` в **същата queue** (`QUEUE_PDF_GENERATION`).

Двата processor-а могат да съществуват в едно и също BullMQ queue без конфликт — всеки `@Process('job-name')` decorator регистрира handler само за своя job type.

```typescript
// Съществуващ — в policies модула
@Process('generate-policy-pdf')
async process(job: Job<PdfGenerationJobPayload>) { ... }

// Нов — в fleet модула
@Process('generate-batch-pdf')
async process(job: Job<BatchPdfJobPayload>) { ... }
```

### ZIP Assembly с `archiver`

Инсталирай: `npm install archiver` и `npm install --save-dev @types/archiver`

```typescript
import archiver from 'archiver';
import { PassThrough } from 'stream';

async assembleBatchZip(pdfBuffers: { policyId: string; buffer: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const passThrough = new PassThrough();
    const chunks: Buffer[] = [];
    passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passThrough.on('end', () => resolve(Buffer.concat(chunks)));
    passThrough.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(passThrough);
    archive.on('error', reject);

    for (const { policyId, buffer } of pdfBuffers) {
      archive.append(buffer, { name: `policy-${policyId}.pdf` });
    }

    void archive.finalize();
  });
}
```

### S3 Presigned URL

Reuse съществуващия `AwsS3Service` (от `policies/` или `common/`). Ако нямат генерализиран метод, добави:
```typescript
async generatePresignedUrl(s3Key: string, expiresInSeconds: number): Promise<string> {
  const command = new GetObjectCommand({ Bucket: this.bucket, Key: s3Key });
  return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
}
```

S3 ключ за ZIP: `{tenantId}/fleet/exports/{exportId}/policies.zip`

### Atomicity на Progress Updates

`incrementCompleted()` и `incrementFailed()` **ЗАДЪЛЖИТЕЛНО** са атомарни SQL UPDATE операции:
```typescript
// В FleetPdfExportRepository
async incrementCompleted(id: string): Promise<void> {
  await this.dataSource.query(
    'UPDATE fleet_pdf_exports SET completed_count = completed_count + 1, updated_at = NOW() WHERE id = $1',
    [id],
  );
}
```

**НЕ** ползвай TypeORM `save()` за increment — risk от race condition при паралелни workers!

### Проверка дали assembly е нужен

`assembleBatchZip` трябва да се извика **точно веднъж** при `completedCount + failedCount === totalCount`. Ако двама workers завършват почти едновременно, двата могат да достигнат equal condition. Защита:

```typescript
// В FleetPdfExportRepository
async tryMarkForAssembly(id: string, totalCount: number): Promise<boolean> {
  const result = await this.dataSource.query<{ affected: number }[]>(
    `UPDATE fleet_pdf_exports
     SET status = 'processing'
     WHERE id = $1
       AND status != 'processing'
       AND (completed_count + failed_count) = $2
     RETURNING id`,
    [id, totalCount],
  );
  return (result as unknown[]).length > 0;
}
```
Само ако `tryMarkForAssembly` връща `true` → извикай `assembleBatchZip()`.

### API Endpoints

```
POST /fleet/exports
Authorization: Bearer {jwt}
Request: { "policyIds": ["uuid1", "uuid2", ...] }  (max 50)
Response 201: {
  "exportId": "uuid",
  "status": "processing",
  "totalCount": 5,
  "completedCount": 0,
  "failedCount": 0,
  "failedPolicyIds": [],
  "zipS3Key": null,
  "expiresAt": null
}

GET /fleet/exports/:exportId
Authorization: Bearer {jwt}
Response 200: {
  "exportId": "uuid",
  "status": "partial",
  "totalCount": 5,
  "completedCount": 4,
  "failedCount": 1,
  "failedPolicyIds": [{ "policyId": "uuid3", "error": "PDF generation timeout" }],
  "zipS3Key": "tenant-uuid/fleet/exports/export-uuid/policies.zip",
  "expiresAt": "2026-03-23T10:00:00Z"
}

GET /fleet/exports/:exportId/download
Authorization: Bearer {jwt}
Response 200: {
  "downloadUrl": "https://s3.amazonaws.com/...?X-Amz-Expires=900&...",
  "expiresInSeconds": 900
}

Response 410 (Gone):
{ "message": "Export has expired. Please generate a new batch export." }
```

### Fleet Module Import Chain (актуализиран)

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([FleetVehicle, FleetPdfExport]),
    TenantContextModule,
    TenantsModule,
    QuotesModule,
    PaymentsModule,
    PoliciesModule,      // за PdfGenerationService + PoliciesRepository
    NotificationsModule, // за NotificationsService
    AwsModule,           // за AwsS3Service
    BullModule.registerQueue({ name: QUEUE_PDF_GENERATION }),
  ],
  providers: [
    FleetService,
    FleetBulkService,
    FleetPdfExportService,
    FleetPdfBatchProcessor,
    FleetRepository,
    FleetPdfExportRepository,
  ],
  controllers: [FleetController],
})
export class FleetModule {}
```

### Project Structure Notes

Добавени/модифицирани файлове:
```
branivo-api/src/infrastructure/database/migrations/
└── 1710000027000-CreateFleetPdfExports.ts  (new)

branivo-api/src/modules/fleet/
├── fleet.controller.ts          (modify — add 3 export endpoints)
├── fleet.module.ts              (modify — add FleetPdfExport, services, PoliciesModule, NotificationsModule)
├── fleet-pdf-export.service.ts  (new)
├── fleet-pdf-export.service.spec.ts (new)
├── fleet-pdf-export.repository.ts  (new)
├── fleet-pdf-batch.processor.ts (new)
├── fleet-pdf-export.types.ts    (new)
├── fleet.controller.spec.ts     (modify — add export endpoint tests)
├── entities/
│   └── fleet-pdf-export.entity.ts  (new)
└── dto/
    ├── batch-export-request.dto.ts  (new)
    ├── batch-export-response.dto.ts (new)
    └── batch-export-download.dto.ts (new)

branivo-api/src/infrastructure/database/seed.service.ts  (modify — add seedFleetPdfExports)

branivo-web/src/app/[locale]/(broker)/fleet/page.tsx  (modify — add export button)
branivo-web/src/app/[locale]/(broker)/fleet/exports/[exportId]/page.tsx  (new)
branivo-web/src/components/fleet/FleetExportStatusCard.tsx  (new)
branivo-web/src/__tests__/broker/fleet/FleetExportStatusCard.test.tsx  (new)

branivo_app/lib/features/fleet/bloc/fleet_export_bloc.dart  (new)
branivo_app/lib/features/fleet/data/models/fleet_export_model.dart  (new)
branivo_app/lib/features/fleet/data/repositories/fleet_export_repository.dart  (new)
branivo_app/lib/features/fleet/screens/fleet_export_progress_screen.dart  (new)
branivo_app/lib/features/fleet/screens/fleet_dashboard_screen.dart  (modify — add export button)
branivo_app/test/features/fleet/screens/fleet_export_progress_screen_test.dart  (new)
```

### Важни ЗАБРАНИ

- **НЕ** дублирай PDF генерационна логика — reuse `PdfGenerationService`
- **НЕ** дефинирай нова BullMQ queue — използвай `QUEUE_PDF_GENERATION`
- **НЕ** предоставяй директен S3 URL — само presigned URL с TTL 15 мин
- **НЕ** предавай `tenantId` като функционален параметър — използвай `TenantContext`
- **НЕ** ползвай TypeORM `save()` за increment на counters — race condition при паралелни workers
- **НЕ** позволявай достъп до export на чужд тенант — `findByIdAndTenant()` задължително
- **НЕ** добавяй нови indexes без `CREATE INDEX` в migration
- **НЕ** добавяй saga или distributed lock logic — `tryMarkForAssembly()` atomic SQL е достатъчен

### Learnings от Story 7.2

- **Module imports са критични** — `QuotesModule` и `PaymentsModule` трябваха да export-ват своите services; провери `PoliciesModule` и `NotificationsModule` по същия начин
- **`/* eslint-disable @typescript-eslint/unbound-method */`** — добавяй в spec файловете при mock на class methods
- **`@ApiProperty()`** декоратори са задължителни на всяко DTO поле — без тях Swagger doc е непълен и lint може да fail-не
- **`ProviderNotFoundException`** — ако service не е добавен в providers OR module-ът не е в imports → NestJS хвърля при startup; провери module конфигурацията преди да push-неш
- **Retry бутон** — frontend трябва да изпрати само failed items при retry, не целия batch
- **`POST` за мутации** — `useQuery` не е правилният hook за POST заявки в Next.js; използвай `useMutation` от TanStack Query

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.3] — User story, AC
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7] — Fleet management бизнес контекст
- [Source: _bmad-output/planning-artifacts/architecture.md#BullMQ] — Queue architecture, processor rules (MAX 20 реда)
- [Source: _bmad-output/planning-artifacts/architecture.md#S3 Key Structure] — `{tenantId}/fleet/exports/{exportId}/policies.zip`
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory] — branivo-api/src/modules/fleet/ структура
- [Source: branivo-api/src/modules/policies/pdf-generation.processor.ts] — Съществуващ processor pattern, `QUEUE_PDF_GENERATION`, `'generate-policy-pdf'` job type
- [Source: branivo-api/src/infrastructure/queues/queue.module.ts] — `QUEUE_PDF_GENERATION` константа
- [Source: _bmad-output/implementation-artifacts/7-2-bulk-quote-policy-purchase.md#Dev Notes] — Module import chain, guard patterns, TypeScript no-any, `/* eslint-disable */` в spec файлове, `ProviderNotFoundException` lesson, `useMutation` за POST
- [Source: _bmad-output/implementation-artifacts/7-1-fleet-vehicle-status-dashboard.md] — `FleetController` guard конфигурация, `TenantContext` pattern
- [Source: _bmad-output/planning-artifacts/project-context.md#Architecture Rules] — Controller → Service → Repository, MAX 30 lines/function, MAX 300 lines/file

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List

### Completion Notes List

1. `tryMarkForAssembly()` uses a CAS atomic SQL UPDATE (status NOT IN assembling/completed/partial/failed) to prevent double-assembly with parallel workers — returns true only when the UPDATE actually modifies a row.
2. `PoliciesRepository.findManyByIds()` uses TypeORM `In()` operator to avoid `@InjectDataSource()` injection which would have broken existing tests.
3. `PdfGenerationService.generateAndUploadPolicyPdf()` was added as a public method that generates and uploads only the policy PDF (no email), returning the S3 key for ZIP assembly.
4. `FleetExportProgressScreen` accepts an optional `testBloc` parameter using `BlocProvider.value` seam to make widget tests possible without fighting the screen's internal BlocProvider.
5. `GoneException` does not exist in NestJS — used `new HttpException('...', HttpStatus.GONE)` instead.
6. `requestedBy` is extracted from `req.user.userId` in the controller since `TenantContext` only exposes `getTenantId()`.
7. All 21 tasks implemented. CI results: API 549 tests pass, Web lint+typecheck+build clean, Flutter 79 tests pass, flutter analyze 0 errors/warnings.

### File List

branivo-api/src/infrastructure/database/migrations/1710000027000-CreateFleetPdfExports.ts
branivo-api/src/modules/fleet/entities/fleet-pdf-export.entity.ts
branivo-api/src/modules/fleet/dto/batch-export-request.dto.ts
branivo-api/src/modules/fleet/dto/batch-export-response.dto.ts
branivo-api/src/modules/fleet/dto/batch-export-download.dto.ts
branivo-api/src/modules/fleet/fleet-pdf-export.types.ts
branivo-api/src/modules/fleet/fleet-pdf-export.repository.ts
branivo-api/src/modules/fleet/fleet-pdf-export.service.ts
branivo-api/src/modules/fleet/fleet-pdf-export.service.spec.ts
branivo-api/src/modules/fleet/fleet-pdf-batch.processor.ts
branivo-api/src/modules/fleet/fleet.controller.ts
branivo-api/src/modules/fleet/fleet.controller.spec.ts
branivo-api/src/modules/fleet/fleet.module.ts
branivo-api/src/modules/fleet/dto/fleet-vehicle-response.dto.ts
branivo-api/src/modules/fleet/fleet.repository.ts
branivo-api/src/modules/fleet/fleet.service.ts
branivo-api/src/modules/policies/policies.repository.ts
branivo-api/src/modules/policies/pdf-generation.service.ts
branivo-api/src/infrastructure/database/seed.service.ts
branivo-web/src/app/[locale]/(broker)/fleet/page.tsx
branivo-web/src/app/[locale]/(broker)/fleet/exports/[exportId]/page.tsx
branivo-web/src/components/fleet/FleetExportStatusCard.tsx
branivo-web/src/__tests__/broker/fleet/FleetExportStatusCard.test.tsx
branivo_app/lib/features/fleet/bloc/fleet_export_bloc.dart
branivo_app/lib/features/fleet/data/models/fleet_export_model.dart
branivo_app/lib/features/fleet/data/repositories/fleet_export_repository.dart
branivo_app/lib/features/fleet/screens/fleet_export_progress_screen.dart
branivo_app/lib/features/fleet/screens/fleet_dashboard_screen.dart
branivo_app/lib/features/fleet/data/models/fleet_vehicle.dart
branivo_app/test/features/fleet/screens/fleet_export_progress_screen_test.dart
