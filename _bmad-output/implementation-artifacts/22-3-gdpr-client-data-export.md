# Story 22.3: GDPR Client Data Export (Right of Access)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an end customer,
I want to request and download all my personal data,
so that I can exercise my GDPR right of access (Article 15).

## Acceptance Criteria

### AC1 — Заявка за data export (queue-ване)
**Given** logged-in end client извика `POST /clients/me/data-export`,
**When** нямат активна заявка в последните 24 часа,
**Then** системата:
  - Създава `data_export_requests` запис със `status: 'pending'`
  - Queue-ва `data-export:process` BullMQ job с `{ requestId, customerId, tenantId }`
  - Изпраща email потвърждение: "Вашият data export се подготвя. Ще получите линк в рамките на 24 часа."
  - Връща HTTP 202 `{ message: "...", requestId: "uuid" }`

### AC2 — Rate limit: 1 export per 24 часа
**Given** end client е направил export заявка в последните 24 часа,
**When** извика `POST /clients/me/data-export` отново,
**Then** HTTP 429 с `{ error: "Можете да поискате само 1 data export на 24 часа." }`.

### AC3 — Успешно генериране на ZIP архив
**Given** `DataExportProcessor` обработва job-а,
**When** завърши успешно,
**Then**:
  - `data_export_requests.status` = `'completed'`
  - `data_export_requests.s3_key` е попълнен (key format: `exports/{tenantId}/{customerId}/{requestId}.zip`)
  - `data_export_requests.expires_at` = NOW() + 48 часа
  - ZIP архивът съдържа: `profile.json`, `vehicles.json`, `policies.json`, `payments.json`, `consents.json`
  - Клиентът получава имейл с Signed S3 URL (TTL: 48 часа)

### AC4 — Данните са scoped и sanitized
**Given** ZIP архивът е генериран,
**When** се отвори,
**Then**:
  - Съдържа САМО данните на конкретния клиент (tenant_id + customer_id scope)
  - PII полета са включени (name, phone, email, VIN, license plate)
  - Изключени: `stripePaymentIntentId`, `stripeClientSecret`, `insurer_api_key` — НИКОГА не се включват в export
  - `consents.json` е празен масив (`[]`) с коментар NOTE (consent module все още не е имплементиран)

### AC5 — Status endpoint
**Given** end client извика `GET /clients/me/data-export/status`,
**When** има активна или последна заявка,
**Then** HTTP 200 `{ status: 'pending'|'processing'|'completed'|'failed', expiresAt?, downloadUrl? }`
  — `downloadUrl` се генерира on-demand (нов Signed URL при всяка заявка, TTL 48h) само ако `status === 'completed'`.

### AC6 — Процесор failure handling
**Given** `DataExportProcessor` хвърли грешка,
**When** всички retries са изчерпани (attempts: 3),
**Then** `data_export_requests.status` = `'failed'`; логва `[DLQ] DataExport failed for requestId: {id}`.

### AC7 — Unit тест: DataExportService — data aggregation, scoping, PII inclusion
**Given** unit тест с mock repositories,
**When** се изпълни,
**Then** потвърждава: tenant_id scoping работи; PII полета са включени; Stripe полета са изключени.

### AC8 — Integration тест: пълен export flow
**Given** integration тест с реален HTTP layer (supertest),
**When** full flow: POST request → 202 → GET status → completed,
**Then** тестът потвърждава rate limiting (429 при втора заявка в 24h) и статус transitions.

---

## Tasks / Subtasks

- [x] Task 1: DB Migration — `data_export_requests` таблица (AC1, AC3)
  - [x] 1.1 Създай `branivo-api/src/infrastructure/database/migrations/1710000036000-CreateDataExportRequests.ts`
  - [x] 1.2 В `up()`:
    ```sql
    CREATE TABLE "data_export_requests" (
      "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "tenant_id"   UUID NOT NULL,
      "customer_id" UUID NOT NULL REFERENCES "end_clients"("id") ON DELETE CASCADE,
      "status"      VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','completed','failed')),
      "s3_key"      VARCHAR(500) NULL,
      "expires_at"  TIMESTAMPTZ NULL,
      "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX "idx_data_export_requests_customer_id" ON "data_export_requests" ("customer_id");
    CREATE INDEX "idx_data_export_requests_tenant_id_created_at"
      ON "data_export_requests" ("tenant_id", "created_at");
    ```
  - [x] 1.3 В `down()`: `DROP TABLE IF EXISTS "data_export_requests";`
  - [x] 1.4 `tenant_id` е WITHOUT FK constraint — follows project pattern (RLS handles isolation)

- [x] Task 2: `DataExportRequest` TypeORM entity (AC1, AC3)
  - [x] 2.1 Създай `branivo-api/src/modules/data-export/entities/data-export-request.entity.ts`
  - [x] 2.2 Fields:
    ```typescript
    @Entity('data_export_requests')
    export class DataExportRequest {
      @PrimaryGeneratedColumn('uuid') id!: string;
      @Column({ name: 'tenant_id' }) tenantId!: string;
      @Column({ name: 'customer_id' }) customerId!: string;
      @Column({ name: 'status', default: 'pending' }) status!: DataExportStatus;
      @Column({ name: 's3_key', nullable: true, type: 'varchar' }) s3Key!: string | null;
      @Column({ name: 'expires_at', nullable: true, type: 'timestamptz' }) expiresAt!: Date | null;
      @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
    }
    export enum DataExportStatus {
      PENDING = 'pending', PROCESSING = 'processing', COMPLETED = 'completed', FAILED = 'failed',
    }
    ```
  - [x] 2.3 Без `@DeleteDateColumn` — export requests не се soft delete-ват (audit trail)

- [x] Task 3: `DataExportRepository` (AC1, AC2, AC3, AC5)
  - [x] 3.1 Създай `branivo-api/src/modules/data-export/data-export.repository.ts`
  - [x] 3.2 **НЕ наследявай `BaseRepository`** — нямаме нужда от RLS за admin operations в processor; ползвай директно `Repository<DataExportRequest>`
  - [x] 3.3 Методи:
    ```typescript
    async create(customerId: string, tenantId: string): Promise<DataExportRequest>
    async findById(id: string): Promise<DataExportRequest | null>
    async findLatestForCustomer(customerId: string, tenantId: string): Promise<DataExportRequest | null>
      // WHERE customer_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1
    async updateStatus(id: string, status: DataExportStatus): Promise<void>
    async markCompleted(id: string, s3Key: string, expiresAt: Date): Promise<void>
    ```
  - [x] 3.4 Rate limit check: в `DataExportService` — `findLatestForCustomer` + compare `createdAt > NOW() - INTERVAL '24 hours'`

- [x] Task 4: Нова `QUEUE_DATA_EXPORT` константа в `queue.module.ts` (AC1)
  - [x] 4.1 Добави в `branivo-api/src/infrastructure/queues/queue.module.ts`:
    ```typescript
    export const QUEUE_DATA_EXPORT = 'data-export';
    ```
  - [x] 4.2 Добави `{ name: QUEUE_DATA_EXPORT }` в `BullModule.registerQueue(...)` array
  - [x] 4.3 Добави `QUEUE_OCR_PROCESSING` ако не е в `registerQueue` (виж текущото — `QUEUE_OCR_PROCESSING` е дефиниран но не e регистриран)

- [x] Task 5: `DataExportService` — business logic (AC1, AC2, AC3, AC4, AC5)
  - [x] 5.1 Създай `branivo-api/src/modules/data-export/data-export.service.ts`
  - [x] 5.2 `requestExport(customerId: string, tenantId: string): Promise<{ requestId: string }>`:
    - `findLatestForCustomer(customerId, tenantId)` → ако `createdAt > new Date(Date.now() - 24 * 3600 * 1000)` → throw `HttpException('...', 429)`
    - `dataExportRepo.create(customerId, tenantId)` → `request`
    - `this.dataExportQueue.add('data-export:process', { requestId: request.id, customerId, tenantId })`
    - `emailService.sendDataExportRequestedEmail({ to: customerEmail, tenantId })` — send confirmation
    - return `{ requestId: request.id }`
  - [x] 5.3 `getStatus(requestId: string, customerId: string, tenantId: string): Promise<DataExportStatusResponse>`:
    - `findById(requestId)` → validate ownership (customerId match)
    - Ако `status === 'completed' && s3Key && expiresAt > now` → генерирай нов Signed URL (48h TTL) → include в response
    - return `{ status, expiresAt?, downloadUrl? }`
  - [x] 5.4 Инжектирай: `DataExportRepository`, `@InjectQueue(QUEUE_DATA_EXPORT) dataExportQueue: Queue`, `EmailService`, repositories за aggregation (EndClientRepository, VehiclesRepository, PoliciesRepository, PaymentsRepository)

- [x] Task 6: `DataExportProcessor` — BullMQ processor (AC3, AC4, AC6)
  - [x] 6.1 Създай `branivo-api/src/modules/data-export/data-export.processor.ts`
  - [x] 6.2 Pattern (следвай `webhook-processing.processor.ts`):
    ```typescript
    @Processor(QUEUE_DATA_EXPORT)
    export class DataExportProcessor {
      private readonly logger = new Logger(DataExportProcessor.name);
      constructor(
        private readonly dataExportRepository: DataExportRepository,
        private readonly dataAggregatorService: DataAggregatorService,
        private readonly s3Service: S3Service,
        private readonly emailService: EmailService,
      ) {}

      @Process('data-export:process')
      async handleExport(job: Job<DataExportJobData>): Promise<void> {
        const { requestId, customerId, tenantId } = job.data;
        await this.dataExportRepository.updateStatus(requestId, DataExportStatus.PROCESSING);
        const zipBuffer = await this.dataAggregatorService.buildExportZip(customerId, tenantId);
        const s3Key = `exports/${tenantId}/${customerId}/${requestId}.zip`;
        await this.s3Service.uploadExportArchive(s3Key, zipBuffer);
        const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
        await this.dataExportRepository.markCompleted(requestId, s3Key, expiresAt);
        const signedUrl = await this.s3Service.generatePresignedUrl(s3Key, 48 * 3600);
        // fetch customer email for notification
        await this.emailService.sendDataExportReadyEmail({ to: customerEmail, downloadUrl: signedUrl, expiresAt, tenantId });
        this.logger.log(`DataExport completed for requestId: ${requestId}`);
      }

      @OnQueueFailed()
      async onFailed(job: Job<DataExportJobData>, error: Error): Promise<void> {
        const maxAttempts = job.opts.attempts ?? 3;
        if (job.attemptsMade >= maxAttempts) {
          this.logger.error(`[DLQ] DataExport exhausted ${maxAttempts} retries for requestId: ${job.data.requestId}`, error.stack);
          await this.dataExportRepository.updateStatus(job.data.requestId, DataExportStatus.FAILED);
        }
      }
    }
    ```
  - [x] 6.3 `DataExportJobData` interface: `{ requestId: string; customerId: string; tenantId: string }`
  - [x] 6.4 **Без `any`** — всички типове са explicit

- [x] Task 7: `DataAggregatorService` — ZIP генериране (AC3, AC4)
  - [x] 7.1 Създай `branivo-api/src/modules/data-export/data-aggregator.service.ts`
  - [x] 7.2 `buildExportZip(customerId: string, tenantId: string): Promise<Buffer>`:
    - Агрегирай данни паралелно: `Promise.all([...])` с 5 queries
    - `profile.json`: `EndClientRepository.findById(customerId)` (НИКОГА не включвай `pushToken` — system field)
    - `vehicles.json`: `VehiclesRepository.findByOwnerId(customerId, tenantId)` — fields: id, vin, licensePlate, make, model, year, color (без системни полета)
    - `policies.json`: `PoliciesRepository.findByEndClientId(customerId, tenantId)` — fields: id, policyNumber, status, premiumAmount, currency, coverageStartDate, coverageEndDate, createdAt; **ИЗКЛЮЧИ**: stripePaymentIntentId, commissionAmount, commissionPct, metadata
    - `payments.json`: `PaymentsRepository.findByEndClientId(customerId, tenantId)` — fields: id, amount, currency, status, paymentMethod, createdAt; **ИЗКЛЮЧИ**: stripePaymentIntentId, stripeClientSecret, idempotencyKey
    - `consents.json`: `[]` (consent module не е имплементиран; placeholder за GDPR completeness)
  - [x] 7.3 ZIP генерирай с `archiver` npm package:
    ```typescript
    import * as archiver from 'archiver';
    const archive = archiver.create('zip');
    archive.append(JSON.stringify(profileData, null, 2), { name: 'profile.json' });
    // ... за всеки файл
    ```
  - [x] 7.4 Върни `Buffer` — не пишеш на диска
  - [x] 7.5 `archiver` е вече в зависимостите? Провери `branivo-api/package.json` — ако не е, добави: `npm install archiver` + `npm install -D @types/archiver`

- [x] Task 8: `S3Service.uploadExportArchive()` (AC3)
  - [x] 8.1 Добави метод в `branivo-api/src/infrastructure/s3/s3.service.ts`:
    ```typescript
    async uploadExportArchive(key: string, buffer: Buffer): Promise<void> {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: 'application/zip',
        }),
      );
      this.logger.log(`Export archive uploaded: ${key}`);
    }
    ```
  - [x] 8.2 Reuse съществуващия `generatePresignedUrl(key, expiresInSeconds)` — TTL: `48 * 3600` секунди

- [x] Task 9: `EmailService` — нови email методи (AC1, AC3)
  - [x] 9.1 Добави в `branivo-api/src/infrastructure/email/email.service.ts`:
    ```typescript
    async sendDataExportRequestedEmail(params: {
      to: string;
      tenantId: string;
    }): Promise<void>
    ```
    Body: "Вашият data export се подготвя. Ще получите линк в рамките на 24 часа."
  - [x] 9.2 Добави:
    ```typescript
    async sendDataExportReadyEmail(params: {
      to: string;
      downloadUrl: string;
      expiresAt: Date;
      tenantId: string;
    }): Promise<void>
    ```
    Body: "Вашият data export е готов. Изтеглете го от следния линк (валиден до {expiresAt}):"
    + `<a href="${downloadUrl}">Изтегли личните ми данни</a>`
  - [x] 9.3 **Задължително** escapeвай `downloadUrl` в HTML — ползвай съществуващия `private escapeHtml()` метод от `email.service.ts:148`
  - [x] 9.4 Subject: `"Данните ви са готови за изтегляне — Branivo"`

- [x] Task 10: `DataExportController` — REST endpoints (AC1, AC2, AC5)
  - [x] 10.1 Създай `branivo-api/src/modules/data-export/data-export.controller.ts`
  - [x] 10.2 Endpoints:
    ```typescript
    @Controller('clients/me/data-export')
    @UseGuards(ClientJwtAuthGuard)
    export class DataExportController {
      @Post()
      @HttpCode(HttpStatus.ACCEPTED)
      @Throttle({ default: { limit: 5, ttl: 60000 } })  // IP-level baseline
      async requestExport(
        @CurrentUser() user: AuthenticatedUser,
      ): Promise<{ message: string; requestId: string }> { ... }

      @Get('status')
      async getStatus(
        @CurrentUser() user: AuthenticatedUser,
      ): Promise<DataExportStatusResponseDto> { ... }
    }
    ```
  - [x] 10.3 `@CurrentUser()` декоратор е в `branivo-api/src/modules/clients/decorators/current-user.decorator.ts`
  - [x] 10.4 `ClientJwtAuthGuard` е в `branivo-api/src/modules/clients/guards/client-jwt-auth.guard.ts`
  - [x] 10.5 `tenantId` = `TenantContext.getTenantId()` — НИКОГА не от user token директно

- [x] Task 11: DTOs (AC1, AC5)
  - [x] 11.1 Създай `branivo-api/src/modules/data-export/dto/data-export-response.dto.ts`:
    ```typescript
    export class DataExportResponseDto {
      message: string;
      requestId: string;
    }
    export class DataExportStatusResponseDto {
      status: DataExportStatus;
      expiresAt?: Date;
      downloadUrl?: string;
    }
    ```

- [x] Task 12: `DataExportModule` — NestJS module (AC1)
  - [x] 12.1 Създай `branivo-api/src/modules/data-export/data-export.module.ts`
  - [x] 12.2 `imports`: `TypeOrmModule.forFeature([DataExportRequest])`, `BullModule.registerQueue({ name: QUEUE_DATA_EXPORT })`, `S3Module`, `EmailModule`, `ClientsModule` (за EndClientRepository), `VehiclesModule`, `PoliciesModule`, `PaymentsModule`
  - [x] 12.3 `providers`: `DataExportService`, `DataExportRepository`, `DataExportProcessor`, `DataAggregatorService`
  - [x] 12.4 `controllers`: `DataExportController`
  - [x] 12.5 Добави `DataExportModule` в `AppModule` imports

- [x] Task 13: Repository extensions за data aggregation (AC3, AC4)
  - [x] 13.1 `VehiclesRepository.findByOwnerId(ownerId: string, tenantId: string): Promise<Vehicle[]>`
    - Добави в `branivo-api/src/modules/vehicles/vehicles.repository.ts`
    - `WHERE owner_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`
  - [x] 13.2 `PoliciesRepository.findByEndClientId(endClientId: string, tenantId: string): Promise<Policy[]>`
    - Добави в `branivo-api/src/modules/policies/policies.repository.ts`
    - `WHERE end_client_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`
  - [x] 13.3 `PaymentsRepository.findByEndClientId(endClientId: string, tenantId: string): Promise<Payment[]>`
    - Добави в `branivo-api/src/modules/payments/payments.repository.ts`
    - `WHERE end_client_id = $1 AND tenant_id = $2`
  - [x] 13.4 `EndClientRepository.findById(id: string): Promise<EndClient | null>`
    - Добави в `branivo-api/src/modules/clients/repositories/end-client.repository.ts`
    - Ако вече съществува метод — провери и reuse

- [x] Task 14: Seeder — seed данни за dev среда (AC1)
  - [x] 14.1 **НЕ добавяй seed** за `data_export_requests` — таблицата е ephemeral (попълва се от реален flow)
  - [x] 14.2 Провери `branivo-api/src/infrastructure/database/seed.service.ts` — не са нужни промени

- [x] Task 15: Unit тестове — `DataExportService` и `DataAggregatorService` (AC7)
  - [x] 15.1 Създай `branivo-api/src/modules/data-export/data-export.service.spec.ts`
  - [x] 15.2 Тестове:
    - `requestExport` — rate limit: `createdAt` преди 23ч → 429
    - `requestExport` — success: queue-ва job, изпраща confirmation email
    - `getStatus` — `completed` с валидно `expiresAt` → генерира downloadUrl
    - `getStatus` — ownership mismatch → `NotFoundException`
  - [x] 15.3 Създай `branivo-api/src/modules/data-export/data-aggregator.service.spec.ts`
  - [x] 15.4 Тестове:
    - `buildExportZip` — tenant_id scoping: vehicles query вика `findByOwnerId(customerId, tenantId)`
    - `buildExportZip` — PII включен: VIN, licensePlate са в vehicles JSON
    - `buildExportZip` — Stripe excluded: `stripePaymentIntentId` не се появява в policies JSON
    - `buildExportZip` — consents.json е `[]`

- [x] Task 16: Integration тест — full export flow (AC8)
  - [x] 16.1 Добави `branivo-api/src/modules/data-export/data-export.controller.spec.ts`
  - [x] 16.2 Тест: `POST /clients/me/data-export` → HTTP 202 + `{ requestId }`
  - [x] 16.3 Тест: втора заявка в 24h → HTTP 429
  - [x] 16.4 Тест: `GET /clients/me/data-export/status` → `{ status: 'pending' }`

- [x] Task 17: Lint, build, тестове (Gate преди PR)
  - [x] `cd branivo-api && npm run lint` — 0 errors, 0 warnings
  - [x] `cd branivo-api && npm run test:cov` — всички тестове минават
  - [x] `cd branivo-api && npm run build` — компилира успешно

---

## Dev Notes

### Нова модулна структура

```
branivo-api/src/
├── infrastructure/
│   ├── database/migrations/
│   │   └── 1710000036000-CreateDataExportRequests.ts          # НОВ
│   ├── s3/
│   │   └── s3.service.ts                                      # ПРОМЕНЕН: +uploadExportArchive()
│   └── email/
│       └── email.service.ts                                   # ПРОМЕНЕН: +sendDataExportRequestedEmail, +sendDataExportReadyEmail
├── modules/
│   ├── data-export/                                           # НОВ модул
│   │   ├── entities/
│   │   │   └── data-export-request.entity.ts                  # НОВ
│   │   ├── dto/
│   │   │   └── data-export-response.dto.ts                    # НОВ
│   │   ├── data-export.repository.ts                          # НОВ
│   │   ├── data-export.service.ts                             # НОВ
│   │   ├── data-export.service.spec.ts                        # НОВ
│   │   ├── data-aggregator.service.ts                         # НОВ
│   │   ├── data-aggregator.service.spec.ts                    # НОВ
│   │   ├── data-export.processor.ts                           # НОВ
│   │   ├── data-export.controller.ts                          # НОВ
│   │   ├── data-export.controller.spec.ts                     # НОВ
│   │   └── data-export.module.ts                              # НОВ
│   ├── clients/
│   │   └── repositories/
│   │       └── end-client.repository.ts                       # ПРОМЕНЕН: +findById()
│   ├── vehicles/
│   │   └── vehicles.repository.ts                             # ПРОМЕНЕН: +findByOwnerId()
│   ├── policies/
│   │   └── policies.repository.ts                             # ПРОМЕНЕН: +findByEndClientId()
│   └── payments/
│       └── payments.repository.ts                             # ПРОМЕНЕН: +findByEndClientId()
└── infrastructure/queues/
    └── queue.module.ts                                        # ПРОМЕНЕН: +QUEUE_DATA_EXPORT
```

### BullMQ Pattern — ползвай `@nestjs/bull`

Проектът ползва **`@nestjs/bull`** (не `@nestjs/bullmq` v2) — виж `notification.processor.ts` и `webhook-processing.processor.ts`:

```typescript
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';

@Processor(QUEUE_DATA_EXPORT)
export class DataExportProcessor {
  @Process('data-export:process')
  async handleExport(job: Job<DataExportJobData>): Promise<void> { ... }

  @OnQueueFailed()
  onFailed(job: Job<DataExportJobData>, error: Error): void { ... }
}
```

**НЕ** ползвай `@nestjs/bullmq` или `WorkerHost` — те са за по-новия BullMQ v2 API.

### S3 Key Naming Convention

```
exports/{tenantId}/{customerId}/{requestId}.zip
```

Пример: `exports/550e8400-e29b-41d4-a716-446655440000/6ba7b810-9dad-11d1-80b4-00c04fd430c8/f47ac10b-58cc-4372-a567-0e02b2c3d479.zip`

S3Service вече има:
- `uploadPolicyDocument(key, buffer)` — за PDF (ContentType: `application/pdf`)
- `generatePresignedUrl(key, expiresInSeconds)` — reuse за download URL
- Добавяме: `uploadExportArchive(key, buffer)` — ContentType: `application/zip`

### Signed URL TTL

| Usage | TTL |
|---|---|
| Policy PDFs | 15 min (900 sec) |
| Export ZIP (48h) | 172800 sec |

### ZIP генериране — archiver package

```typescript
import * as archiver from 'archiver';

async buildExportZip(customerId: string, tenantId: string): Promise<Buffer> {
  const [profile, vehicles, policies, payments] = await Promise.all([
    this.endClientRepo.findById(customerId),
    this.vehiclesRepo.findByOwnerId(customerId, tenantId),
    this.policiesRepo.findByEndClientId(customerId, tenantId),
    this.paymentsRepo.findByEndClientId(customerId, tenantId),
  ]);

  return new Promise((resolve, reject) => {
    const archive = archiver.create('zip', { zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    archive.append(JSON.stringify(this.sanitizeProfile(profile), null, 2), { name: 'profile.json' });
    archive.append(JSON.stringify(vehicles.map(v => this.sanitizeVehicle(v)), null, 2), { name: 'vehicles.json' });
    archive.append(JSON.stringify(policies.map(p => this.sanitizePolicy(p)), null, 2), { name: 'policies.json' });
    archive.append(JSON.stringify(payments.map(p => this.sanitizePayment(p)), null, 2), { name: 'payments.json' });
    archive.append(JSON.stringify([], null, 2), { name: 'consents.json' }); // placeholder
    archive.finalize();
  });
}
```

### Sanitization — какво се изключва

```typescript
private sanitizePolicy(policy: Policy): Partial<Policy> {
  const { stripePaymentIntentId, commissionAmount, commissionPct, metadata, ...safe } = policy;
  return safe;
}

private sanitizePayment(payment: Payment): Partial<Payment> {
  const { stripePaymentIntentId, stripeClientSecret, idempotencyKey, ...safe } = payment;
  return safe;
}

private sanitizeProfile(client: EndClient | null): Partial<EndClient> | null {
  if (!client) return null;
  const { pushToken, ...safe } = client; // pushToken е system field
  return safe;
}
```

### Rate Limiting Strategy

1. **IP level** (`@Throttle`): 5 req/min per IP — baseline brute-force protection
2. **Customer level** (DB check): 1 export per 24 часа — GDPR anti-abuse (GDPR позволява "reasonable limits")

Rate limit check в service:
```typescript
const latest = await this.dataExportRepo.findLatestForCustomer(customerId, tenantId);
if (latest && latest.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000)) {
  throw new HttpException('Можете да поискате само 1 data export на 24 часа.', HttpStatus.TOO_MANY_REQUESTS);
}
```

### TenantContext Usage

```typescript
// В controller — ВИНАГИ:
const tenantId = this.tenantContext.getTenantId();

// НИКОГА не вземай tenantId от user token:
// ❌ const tenantId = user.tenantId;
// ✅ const tenantId = this.tenantContext.getTenantId();
```

### Customer Email за Notifications

End client-ът може да няма email (email е nullable в `end_clients` таблицата). Обработи случая:
```typescript
if (!customer.email) {
  this.logger.warn(`DataExport: customer ${customerId} has no email — skip notification`);
  return; // не хвърляй грешка — export се завършва, само нотификацията се пропуска
}
```

### Абсолютни правила

- `audit_log` е IMMUTABLE — не добавяй audit_log entries ръчно
- `НИКОГА` не включвай `insurer.api_key_enc` — не е релевантно, но правилото е в сила
- `НИКОГА` не активирай полица client-side — не е релевантно, но правилото е в сила
- `stripePaymentIntentId` и `stripeClientSecret` — **АБСОЛЮТНО ЗАБРАНЕНИ** в export данни
- Всяка DB заявка в `DataAggregatorService` трябва да има `tenantId` scope (двойна защита)

### Модулни зависимости — circular import prevention

`DataExportModule` ще импортира `ClientsModule`, `VehiclesModule`, `PoliciesModule`, `PaymentsModule`. Провери дали тези модули **export-ват** своите repositories. Ако не — добави `exports: [EndClientRepository]` и т.н.

Алтернатива за избягване на circular deps: инжектирай `DataSource` директно в `DataAggregatorService` и пиши raw queries — по-простo но по-verbose.

### Migration Timestamp последователност

```
1710000034000 — AddStripeEventIdUniqueConstraintToPolicyEvents (последна merged)
1710000035000 — CreatePasswordResetTokens (story 22-2, in-progress)
1710000036000 — CreateDataExportRequests (тази story)  ← правилното следващо число
```

### TypeScript — забранени `any` типове

```typescript
// ПРАВИЛНО — archiver:
archive.on('data', (chunk: Buffer) => chunks.push(chunk));

// ПРАВИЛНО — Promise.all деструктуриране:
const [profile, vehicles, policies, payments]: [EndClient | null, Vehicle[], Policy[], Payment[]] =
  await Promise.all([...]);

// ГРЕШНО:
const result: any = await this.s3Service.generatePresignedUrl(...);
```

### Project Structure Notes

- Endpoint монтиране: `DataExportController` с `@Controller('clients/me/data-export')` — NestJS ще го mount под `/api/v1/clients/me/data-export` (проверявай `main.ts` за глобалния prefix)
- `ClientJwtAuthGuard` проверява `user.role === 'end_client'` — правилния guard за клиентски endpoints
- За `@CurrentUser()` decorator виж `branivo-api/src/modules/clients/decorators/current-user.decorator.ts`

### References

- BullMQ processor pattern: `branivo-api/src/modules/payments/webhook-processing.processor.ts`
- BullMQ simple processor: `branivo-api/src/modules/notifications/processors/notification.processor.ts`
- Queue constants: `branivo-api/src/infrastructure/queues/queue.module.ts`
- S3 service: `branivo-api/src/infrastructure/s3/s3.service.ts`
- Email service (Nodemailer): `branivo-api/src/infrastructure/email/email.service.ts`
- ClientJwtAuthGuard: `branivo-api/src/modules/clients/guards/client-jwt-auth.guard.ts`
- CurrentUser decorator: `branivo-api/src/modules/clients/decorators/current-user.decorator.ts`
- EndClient entity: `branivo-api/src/modules/clients/entities/end-client.entity.ts`
- Policy entity (end_client_id FK): `branivo-api/src/modules/policies/entities/policy.entity.ts:34`
- Payment entity (end_client_id FK): `branivo-api/src/modules/payments/entities/payment.entity.ts:47`
- Vehicle entity (owner_id): `branivo-api/src/modules/vehicles/entities/vehicle.entity.ts:22`
- Previous story (password reset patterns): `_bmad-output/implementation-artifacts/22-2-broker-password-reset-flow.md`
- FR63 (GDPR Right of Access): `_bmad-output/planning-artifacts/epics.md` lines 2815–2850

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_No blocking issues encountered._

### Completion Notes List

- Имплементирани всички 17 задачи + 8 AC-та за GDPR Right of Access (Article 15)
- Нов `data-export` модул с пълен flow: POST request → BullMQ → ZIP → S3 → Signed URL → Email
- Rate limiting: двойна защита — IP-level (Throttle 5 req/min) + customer-level (1 per 24h в DB)
- PII sanitization: `stripePaymentIntentId`, `stripeClientSecret`, `idempotencyKey`, `commissionAmount`, `commissionPct`, `pushToken` са изключени от export
- `consents.json` е placeholder `[]` — consent module ще се имплементира в Epic 11
- `DataExportRepository` не наследява `BaseRepository` — processor работи без tenant RLS context
- Добавен `QUEUE_OCR_PROCESSING` в `registerQueue` (бил е дефиниран но не регистриран)
- jszip инсталиран като dev dep за ZIP parsing в тестовете
- 16 нови unit/integration теста, всички 788 теста в проекта минават

### File List

branivo-api/src/infrastructure/database/migrations/1710000036000-CreateDataExportRequests.ts
branivo-api/src/modules/data-export/entities/data-export-request.entity.ts
branivo-api/src/modules/data-export/data-export.repository.ts
branivo-api/src/modules/data-export/data-export.service.ts
branivo-api/src/modules/data-export/data-export.service.spec.ts
branivo-api/src/modules/data-export/data-aggregator.service.ts
branivo-api/src/modules/data-export/data-aggregator.service.spec.ts
branivo-api/src/modules/data-export/data-export.processor.ts
branivo-api/src/modules/data-export/data-export.controller.ts
branivo-api/src/modules/data-export/data-export.controller.spec.ts
branivo-api/src/modules/data-export/data-export.module.ts
branivo-api/src/modules/data-export/dto/data-export-response.dto.ts
branivo-api/src/infrastructure/queues/queue.module.ts
branivo-api/src/infrastructure/s3/s3.service.ts
branivo-api/src/infrastructure/email/email.service.ts
branivo-api/src/modules/vehicles/vehicles.repository.ts
branivo-api/src/modules/vehicles/vehicles.module.ts
branivo-api/src/modules/policies/policies.repository.ts
branivo-api/src/modules/payments/payments.repository.ts
branivo-api/src/modules/clients/repositories/end-client.repository.ts
branivo-api/src/modules/clients/clients.module.ts
branivo-api/src/app.module.ts
branivo-api/package.json
