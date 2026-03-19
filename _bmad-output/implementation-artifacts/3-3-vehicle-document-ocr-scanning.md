# Story 3.3: Vehicle Document OCR Scanning

Status: done

## Story

As an end-client,
I want to scan my vehicle registration document with my camera,
So that my vehicle data is filled automatically without manual typing.

## Acceptance Criteria

1. **AC1 — Camera guide UI:**
   **Given** клиент инициира регистрация на МПС,
   **When** камерата се активира,
   **Then** показва се high-contrast frame guide с voice feedback ("Насочете камерата към документа") — Flutter: `Semantics` + `MediaQuery.accessibleNavigation`

2. **AC2 — Google Vision sync path (< 15 сек):**
   **Given** клиент е заснел 3 снимки (Part I + Part II на свидетелство),
   **When** изображенията се изпращат към `POST /api/v1/ocr/scan`,
   **Then** Google Vision API се извиква синхронно; OCR pipeline завършва в < 15 сек; полетата се попълват автоматично; response: `{ jobId, status: "completed", fields: {...}, provider: "google_vision" }`

3. **AC3 — AWS Textract fallback (async):**
   **Given** Google Vision не отговаря в 10 сек или confidence < 0.85 (средно по всички полета),
   **When** fallback към AWS Textract се тригва,
   **Then** BullMQ job (`ocr-processing` queue) се queue-ва; response незабавно: `{ jobId, status: "processing" }`; frontend polls `GET /api/v1/ocr/status/:jobId` на всеки 2 сек; резултат в < 30 сек

4. **AC4 — Confidence ≥ 0.85 → auto-fill:**
   **Given** OCR завърши (Vision или Textract),
   **When** confidence score ≥ 0.85 за дадено поле,
   **Then** полето се попълва автоматично и е визуално маркирано като "потвърдено" (зелена икона/border)

5. **AC5 — Confidence < 0.85 → визуален индикатор:**
   **Given** OCR confidence < 0.85 за дадено поле,
   **When** резултатите се показват,
   **Then** полето е маркирано с жълт border + икона `⚠` + tooltip "Моля, проверете тази информация"; клиентът може да редактира

6. **AC6 — Graceful degradation (OCR пълен провал):**
   **Given** OCR fails completely (Vision timeout + Textract error),
   **When** клиентът е нотифициран,
   **Then** всички полета са достъпни за ръчно въвеждане с ясно съобщение "Не успяхме да разчетем документа. Моля, попълнете ръчно."

7. **AC7 — Reduced motion:**
   **Given** `MediaQuery.disableAnimations` е true (Flutter) или `prefers-reduced-motion` (Web),
   **When** OCR scanning screen зарежда,
   **Then** Lottie/CSS анимации са заменени с color change — без анимационно движение

8. **AC8 — Rate limiting:**
   **Given** IP прави повече от 10 OCR заявки/минута,
   **When** 11-тата заявка пристигне,
   **Then** HTTP 429 с `{ message: "Твърде много заявки. Опитайте след малко.", retry_after: 60 }`

9. **AC9 — Anonymous session update:**
   **Given** OCR завърши успешно,
   **When** резултатите са готови,
   **Then** `vehicle_data` в Redis анонимната сесия (`anon:{sessionId}:session`) се обновява с OCR полетата и `ocr_job_id`

## Tasks / Subtasks

### Backend — DB Migration & Entity

- [x] **Task 1: Миграция — CreateOcrJobsTable** (AC: #2, #3, #4, #5, #6)
  - [x] Файл: `branivo-api/src/infrastructure/database/migrations/1710000010000-CreateOcrJobsTable.ts`
  - [x]Таблица `ocr_jobs` с UUID PK, `tenant_id` FK, `session_token` VARCHAR, `client_id` UUID nullable FK → `end_clients.id`
  - [x]Колони: `status` ENUM(`pending`, `processing`, `completed`, `failed`), `provider` ENUM(`google_vision`, `aws_textract`), `images_count` SMALLINT, `result` JSONB nullable, `confidence_scores` JSONB nullable, `error_message` TEXT nullable
  - [x]`created_at`, `updated_at`, `deleted_at TIMESTAMPTZ NULL`
  - [x]INDEX: `idx_ocr_jobs_tenant_id`, `idx_ocr_jobs_session_token`, `idx_ocr_jobs_status`
  - [x]RLS policy `ocr_jobs_tenant_isolation` с `current_setting('app.current_tenant_id')`

- [x] **Task 2: OcrJobEntity** (AC: #2, #3)
  - [x] Файл: `branivo-api/src/modules/ocr/entities/ocr-job.entity.ts`
  - [x]TypeORM entity с всички колони; `@Column({ name: 'tenant_id' })` задължително; `@Column('jsonb')` за `result` и `confidence_scores`
  - [x]Enum: `OcrJobStatus` (`pending`, `processing`, `completed`, `failed`), `OcrProvider` (`google_vision`, `aws_textract`)

### Backend — OCR Infrastructure

- [x] **Task 3: OcrJobRepository** (AC: #2, #3, #9)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr-job.repository.ts`
  - [x]Extends `BaseRepository<OcrJobEntity>`
  - [x]Methods: `createJob(dto)`, `findById(id, tenantId)`, `updateStatus(id, status, result?, errorMessage?)`, `findBySessionToken(sessionToken, tenantId)`
  - [x]Всички методи ползват `TenantContext.getTenantId()` за tenant scope — НЕ параметър

- [x] **Task 4: GoogleVisionService** (AC: #2, #4, #5)
  - [x] Файл: `branivo-api/src/modules/ocr/providers/google-vision.service.ts`
  - [x]Зависимости: `@google-cloud/vision` — `npm install @google-cloud/vision`
  - [x]`analyzeImages(imageBuffers: Buffer[]): Promise<OcrFieldResult[]>` — извиква `DocumentTextDetection`
  - [x]Парсира текст за български vehicle registration fields (виж OcrFieldResult interface в Dev Notes)
  - [x]Timeout: 10 сек (AbortController + `setTimeout`); при timeout → хвърля `GoogleVisionTimeoutError`
  - [x]Credentials: `GOOGLE_APPLICATION_CREDENTIALS` env var (path до service account JSON)

- [x] **Task 5: AwsTextractService** (AC: #3, #4, #5)
  - [x] Файл: `branivo-api/src/modules/ocr/providers/aws-textract.service.ts`
  - [x]Зависимости: `@aws-sdk/client-textract` — `npm install @aws-sdk/client-textract`
  - [x]`startAnalysis(imageBuffers: Buffer[]): Promise<string>` → returns Textract JobId
  - [x]`getResults(textractJobId: string): Promise<OcrFieldResult[]>` — polls Textract GetDocumentAnalysisCommand
  - [x]Region: `AWS_REGION` env var; credentials от ECS task role (не hardcode)
  - [x]S3 upload: изображенията се качват в S3 (`DOCUMENTS_BUCKET_NAME`) преди Textract; ключ: `ocr-temp/{tenantId}/{jobId}/{filename}` с TTL 1 час (lifecycle rule)

- [x] **Task 6: OcrQueueProducer** (AC: #3)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr-queue.producer.ts`
  - [x]BullMQ queue: `'ocr-processing'` — нова, 4-та queue (отделно от pdf/notifications/logistics)
  - [x]`enqueueTextractJob(payload: OcrQueuePayload)` — добавя job с `{ jobId, tenantId, textractJobId, sessionToken }`
  - [x]Retry: 3 пъти, exponential backoff (1s, 5s, 30s)
  - [x]InjectQueue: `@InjectQueue('ocr-processing') private readonly ocrQueue: Queue`

### Backend — OcrModule Core

- [x] **Task 7: OcrService** (AC: #2, #3, #4, #5, #6, #8, #9)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr.service.ts`
  - [x]Метод `scan(images: Buffer[], sessionToken: string)`:
    1. Rate check (Redis: `ocr_rate:{tenantId}:{ip}`, TTL 60s, max 10)
    2. Създай `ocr_jobs` row с status `processing`
    3. Try Google Vision (timeout 10s)
    4. If success AND avg confidence ≥ 0.85 → update job status=`completed`, return results
    5. If Google Vision fails (timeout / error) OR avg confidence < 0.85 → enqueue Textract BullMQ job
    6. Return `{ jobId, status: "processing" }` → client polls
  - [x]Метод `getStatus(jobId: string)` → returns current job status + results if completed
  - [x]Метод `updateAnonymousSession(sessionToken, tenantId, ocrResult)` → Redis HSET `anon:{sessionToken}:session` field `vehicle_data` (TTL refresh)
  - [x]Inject: `GoogleVisionService`, `AwsTextractService`, `OcrQueueProducer`, `OcrJobRepository`, `@InjectRedis() redis: Redis`, `SessionsModule` (за session update)

- [x] **Task 8: OcrProcessor (BullMQ Worker)** (AC: #3, #4, #5, #6)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr.processor.ts`
  - [x]`@Processor('ocr-processing')` декоратор
  - [x]`@Process() async process(job: Job<OcrQueuePayload>)`:
    1. `AwsTextractService.getResults(textractJobId)` — polls Textract до SUCCEEDED/FAILED
    2. Обнови `ocr_jobs` row с резултати и confidence scores
    3. Обнови Redis anonymous session с vehicle_data
    4. При пълен провал → status=`failed`, error_message записан
  - [x]Timeout: 30 сек total; при exceed → throw error (BullMQ ще retry)

- [x] **Task 9: OcrController** (AC: #2, #3, #8)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr.controller.ts`
  - [x]`POST /api/v1/ocr/scan` — `@Throttle(10, 60)` rate limit; `@UseInterceptors(FilesInterceptor('images', 3, { limits: { fileSize: 15 * 1024 * 1024 } }))`; `X-Session-Token` header задължителен; извиква `OcrService.scan()`
  - [x]`GET /api/v1/ocr/status/:jobId` — без auth (public); извиква `OcrService.getStatus()` с tenant scope
  - [x]Валидация: само JPEG/PNG/WEBP (`image/jpeg`, `image/png`, `image/webp`); reject ако не са 2-3 изображения

- [x] **Task 10: DTOs** (AC: #2, #3)
  - [x]`branivo-api/src/modules/ocr/dto/ocr-scan.dto.ts` — `@IsString() sessionToken`
  - [x]`branivo-api/src/modules/ocr/dto/ocr-result.dto.ts` — OcrFieldResult interface, OcrScanResponseDto
  - [x]`branivo-api/src/modules/ocr/dto/ocr-status.dto.ts` — OcrStatusResponseDto

- [x] **Task 11: OcrModule DI** (AC: #2, #3)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr.module.ts`
  - [x]Imports: `TypeOrmModule.forFeature([OcrJobEntity])`, `BullModule.registerQueue({ name: 'ocr-processing' })`, `MulterModule`, `SessionsModule` (за Redis session update), `TenantContextModule`
  - [x]Providers: `OcrService`, `GoogleVisionService`, `AwsTextractService`, `OcrQueueProducer`, `OcrProcessor`, `OcrJobRepository`
  - [x]**ВАЖНО:** `OcrModule` вече е в `AppModule` — само го разширяваш, не го добавяш отново

### Backend — Тестове

- [x] **Task 12: Unit тестове за OcrService** (AC: #2, #3, #4, #5, #6, #8)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr.service.spec.ts`
  - [x]8 теста: vision success high confidence, vision success low confidence → textract, vision timeout → textract, rate limit exceeded, all providers fail → graceful, getStatus completed, getStatus processing, session token update
  - [x]Mock: `GoogleVisionService`, `AwsTextractService`, `OcrQueueProducer`, `OcrJobRepository`, Redis

- [x] **Task 13: Integration тестове за OcrController** (AC: #2, #3, #8, #9)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr.controller.spec.ts`
  - [x]5 теста: `POST /ocr/scan` 200 vision success, `POST /ocr/scan` 200 textract fallback, `POST /ocr/scan` 429 rate limit, `GET /ocr/status/:jobId` 200, `GET /ocr/status/:jobId` 404 not found

### Next.js Web — OCR Component

- [x] **Task 14: OcrWizard компонент** (AC: #1, #4, #5, #6, #7)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/vehicles/components/ocr-wizard.tsx`
  - [x]3-step flow: (1) снимай Part I, (2) снимай Part II, (3) показване на резултати с confidence
  - [x]Използва browser `getUserMedia` API за camera (Web) — `<input type="file" accept="image/*" capture="environment">` за mobile
  - [x]High-contrast frame guide: `border-4 border-yellow-400` с `role="img" aria-label="Насочете камерата към документа"`
  - [x]При reduced motion (`prefers-reduced-motion: reduce`) — замени анимации с color change
  - [x]Low confidence поле: жълт border `border-amber-400` + иконка `⚠` + `title="Моля, проверете тази информация"`
  - [x]При `status === "failed"` — показва manual form с `aria-live="assertive"` грешка

- [x] **Task 15: `useOcrScanning` hook** (AC: #2, #3, #4, #5, #6, #9)
  - [x] Файл: `branivo-web/src/lib/hooks/use-ocr-scanning.ts`
  - [x]`scanImages(images: File[])` → POST към BFF `/api/v1/ocr/scan`
  - [x]Ако response `status === "processing"` → polling `GET /api/v1/ocr/status/:jobId` на всеки 2 сек (setInterval, cleanup при unmount)
  - [x]Max polling duration: 35 сек → timeout error
  - [x]Типове: `OcrScanResult`, `OcrFieldResult`, `OcrScanStatus`

- [x] **Task 16: BFF routes** (AC: #2, #3)
  - [x]`branivo-web/src/app/api/v1/ocr/scan/route.ts` — `POST`: multipart forward към backend с `X-Session-Token` header
  - [x]`branivo-web/src/app/api/v1/ocr/status/[jobId]/route.ts` — `GET`: proxy към `GET /api/v1/ocr/status/:jobId`

- [x] **Task 17: Next.js тестове** (AC: #1, #4, #5, #6, #7)
  - [x] Файл: `branivo-web/src/__tests__/client/ocr-wizard.test.tsx`
  - [x]6 теста: renders camera guide, shows confidence indicators, shows low confidence warning, shows manual form on failure, hides animations on prefers-reduced-motion, polls for status
  - [x] Файл: `branivo-web/src/__tests__/hooks/use-ocr-scanning.test.ts`
  - [x]4 теста: successful vision scan, textract polling flow, polling timeout, graceful failure

### Flutter — OCR Wizard

- [x] **Task 18: Добави camera пакет** (AC: #1)
  - [x] Файл: `branivo_app/pubspec.yaml` — добави `camera: ^0.11.0` в dependencies
  - [x]Изпълни: `flutter pub get`
  - [x]iOS: добави в `ios/Runner/Info.plist`: `NSCameraUsageDescription` key
  - [x]Android: добави в `android/app/src/main/AndroidManifest.xml`: `<uses-permission android:name="android.permission.CAMERA"/>`

- [x] **Task 19: OcrWizardBloc** (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x]Файлове:
    - `branivo_app/lib/features/ocr/bloc/ocr_wizard_bloc.dart`
    - `branivo_app/lib/features/ocr/bloc/ocr_wizard_event.dart`
    - `branivo_app/lib/features/ocr/bloc/ocr_wizard_state.dart`
  - [x]Events: `OcrStartCaptureEvent`, `OcrImageCapturedEvent(int step, XFile image)`, `OcrScanSubmittedEvent`, `OcrStatusPolledEvent(String jobId)`, `OcrManualFallbackRequestedEvent`
  - [x]States: `OcrInitialState`, `OcrCapturingState(int step)`, `OcrProcessingState(String jobId)`, `OcrCompletedState(Map<String, OcrField> fields)`, `OcrFailedState`, `OcrManualInputState`
  - [x]Polling логика: `Stream.periodic(Duration(seconds: 2))` + `takeWhile` не е completed/failed; max 35 сек

- [x] **Task 20: OcrApiRepository** (AC: #2, #3, #9)
  - [x] Файл: `branivo_app/lib/features/ocr/data/repositories/ocr_api_repository.dart`
  - [x]`scanImages(List<XFile> images, String sessionToken)` → Dio multipart POST `/api/v1/ocr/scan`
  - [x]`getStatus(String jobId)` → Dio GET `/api/v1/ocr/status/:jobId`
  - [x]`X-Session-Token` header от `flutter_secure_storage` (анонимен session token)

- [x] **Task 21: OcrWizardScreen** (AC: #1, #2, #4, #5, #6, #7)
  - [x] Файл: `branivo_app/lib/features/ocr/screens/ocr_wizard_screen.dart`
  - [x]3 стъпки: Step 1 (Part I снимка), Step 2 (Part II снимка), Step 3 (резултати + редактиране)
  - [x]`CameraPreview` с high-contrast overlay; `Semantics(label: 'Насочете камерата към документа')`
  - [x]`MediaQuery.of(context).disableAnimations` — ако true, замени анимации с color transition
  - [x]OcrField widget: жълт `BoxDecoration(border: Border.all(color: Colors.amber))` при confidence < 0.85 + `Icon(Icons.warning_amber)` + Tooltip
  - [x]При `OcrFailedState` → показва `ManualVehicleFormWidget` (изолиран, reusable)

- [x] **Task 22: Flutter Widget тестове** (AC: #1, #4, #5, #6, #7)
  - [x] Файл: `branivo_app/test/features/ocr/ocr_wizard_bloc_test.dart`
  - [x]6 bloc теста: initial → capturing, image captured step 1→2→3, scan submitted → processing, polling completed, polling failed → manual, reduced motion flag propagated

## Dev Notes

### OcrFieldResult Interface

```typescript
// branivo-api/src/modules/ocr/dto/ocr-result.dto.ts
export interface OcrFieldResult {
  license_plate: OcrField;    // Регистрационен номер (напр. СА1234АА)
  vin: OcrField;              // VIN номер (17 символа)
  make: OcrField;             // Марка (Volkswagen, BMW...)
  model: OcrField;            // Модел (Golf, 3 Series...)
  year: OcrField;             // Година на производство
  color: OcrField;            // Цвят
  engine_volume: OcrField;    // Обем на двигателя (куб. см)
  fuel_type: OcrField;        // Вид гориво (бензин, дизел...)
  first_registration_date: OcrField; // Дата на първа регистрация
}

export interface OcrField {
  value: string | null;
  confidence: number;         // 0.0 — 1.0
  auto_filled: boolean;       // true само ако confidence >= 0.85
}

export class OcrScanResponseDto {
  jobId: string;
  status: OcrJobStatus;       // 'completed' | 'processing'
  provider?: OcrProvider;     // само при 'completed'
  fields?: OcrFieldResult;    // само при 'completed'
}
```

### Redis Anonymous Session Update Pattern

```typescript
// В OcrService.updateAnonymousSession():
const sessionKey = `anon:${sessionToken}:session`;
const existing = await this.redis.get(sessionKey);
if (!existing) return; // сесията е изтекла — не се обновява

const sessionData = JSON.parse(existing);
sessionData.vehicle_data = {
  ...sessionData.vehicle_data,
  ...ocrResult,
  ocr_job_id: jobId,
  ocr_completed_at: new Date().toISOString(),
};
// ВАЖНО: refresh TTL до 48h при OCR update
await this.redis.setex(sessionKey, 48 * 3600, JSON.stringify(sessionData));
```

**Защо:** Story 3.1 вече е имплементирала анонимната сесия с TTL 48h. OCR update-ва `vehicle_data` вътре в съществуващата сесия — не прави нова. При migrate (Story 3.2) цялата vehicle_data (включително OCR резултатите) мигрира към `end_clients` акаунта.

### OCR Rate Limiting Pattern

```typescript
// В OcrService.scan() — ПРЕДИ всичко останало:
const rateKey = `ocr_rate:${tenantId}:${clientIp}`;
const count = await this.redis.incr(rateKey);
if (count === 1) await this.redis.expire(rateKey, 60); // 1 минута window
if (count > 10) throw new TooManyRequestsException({ retry_after: 60 });
```

**ВАЖНО:** Rate limiting е на IP ниво, не на tenant ниво. Ключът включва `tenantId` за изолация (различни tenant порталите ≠ shared quota). `@Throttle(10, 60)` на controller level е ДОПЪЛНИТЕЛНА защита — OcrService трябва да прави своя Redis check.

### BullMQ OCR Queue

```typescript
// branivo-api/src/app.module.ts — добавяне към BullModule.forRoot() регистрация
// НЕ правиш нов BullModule.forRoot() — само добавяш 'ocr-processing' в списъка
// Провери как са регистрирани pdf-generation, notifications, logistics queues

// OcrQueuePayload тип:
interface OcrQueuePayload {
  jobId: string;              // ocr_jobs.id
  tenantId: string;
  textractJobId: string;      // AWS Textract job ID
  sessionToken: string;
  s3Bucket: string;
  s3Keys: string[];           // пътищата на изображенията в S3
}
```

### Google Vision API Pattern

```typescript
// Task 4 — GoogleVisionService
import vision from '@google-cloud/vision';

// В constructor — не в module level (за тестваемост):
private readonly client = new vision.ImageAnnotatorClient();

async analyzeImages(imageBuffers: Buffer[]): Promise<OcrFieldResult> {
  // DocumentTextDetection дава по-добри резултати за documents vs TEXT_DETECTION
  const requests = imageBuffers.map(buf => ({
    image: { content: buf.toString('base64') },
    features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
  }));

  // AbortController за 10-сек timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const [results] = await this.client.batchAnnotateImages(
      { requests },
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    return this.parseVehicleRegistration(results);
  } catch (err) {
    if (err.name === 'AbortError') throw new GoogleVisionTimeoutError();
    throw err;
  }
}
```

### AWS Textract Async Pattern

```typescript
// Textract работи АСИНХРОННО — submit → poll → get results
// В AwsTextractService:

async startAnalysis(s3Bucket: string, s3Keys: string[]): Promise<string> {
  // Textract обработва само 1 document per job → merge pages
  // За vehicle registration: 2 документа = 2 Textract jobs OR 1 job с multiple pages
  // РЕШЕНИЕ: качи всички изображения като pages в 1 S3 PDF или Submit 1 job per image
  // ЗА Phase 1: submit 1 job с first image (Part I), parse Part II от Google Vision fallback
  // TODO Story 3.3: може да се оптимизира с multi-page в Phase 2

  const response = await this.textract.send(new StartDocumentAnalysisCommand({
    DocumentLocation: { S3Object: { Bucket: s3Bucket, Name: s3Keys[0] } },
    FeatureTypes: ['FORMS'],
  }));
  return response.JobId!;
}

async getResults(textractJobId: string): Promise<OcrFieldResult> {
  // Polls до JobStatus = SUCCEEDED или FAILED
  let attempts = 0;
  while (attempts < 15) { // max 15 * 2 сек = 30 сек
    await new Promise(r => setTimeout(r, 2000));
    const response = await this.textract.send(new GetDocumentAnalysisCommand({ JobId: textractJobId }));
    if (response.JobStatus === 'SUCCEEDED') return this.parseTextractBlocks(response.Blocks!);
    if (response.JobStatus === 'FAILED') throw new Error('Textract job failed');
    attempts++;
  }
  throw new Error('Textract timeout');
}
```

### Файлова структура — Backend

```
branivo-api/src/modules/ocr/
├── ocr.module.ts                           ← РАЗШИРЕН (вече съществува skeleton)
├── ocr.service.ts                          ← РАЗШИРЕН (вече съществува skeleton)
├── ocr.controller.ts                       ← РАЗШИРЕН (вече съществува skeleton)
├── ocr-job.repository.ts                   ← НОВО
├── ocr-queue.producer.ts                   ← НОВО
├── ocr.processor.ts                        ← НОВО (BullMQ worker)
├── dto/
│   ├── ocr-scan.dto.ts                     ← НОВО
│   ├── ocr-result.dto.ts                   ← НОВО
│   └── ocr-status.dto.ts                   ← НОВО
├── entities/
│   └── ocr-job.entity.ts                   ← НОВО
├── providers/
│   ├── google-vision.service.ts            ← НОВО
│   └── aws-textract.service.ts             ← НОВО
├── ocr.service.spec.ts                     ← НОВО
└── ocr.controller.spec.ts                  ← НОВО

branivo-api/src/infrastructure/database/migrations/
└── 1710000010000-CreateOcrJobsTable.ts     ← НОВО
```

### Файлова структура — Web

```
branivo-web/src/app/[locale]/(client)/vehicles/
└── components/
    └── ocr-wizard.tsx                      ← НОВО

branivo-web/src/app/api/v1/ocr/
├── scan/
│   └── route.ts                            ← НОВО
└── status/
    └── [jobId]/
        └── route.ts                        ← НОВО

branivo-web/src/lib/hooks/
└── use-ocr-scanning.ts                     ← НОВО

branivo-web/src/__tests__/client/
└── ocr-wizard.test.tsx                     ← НОВО

branivo-web/src/__tests__/hooks/
└── use-ocr-scanning.test.ts                ← НОВО
```

### Файлова структура — Flutter

```
branivo_app/lib/features/ocr/
├── bloc/
│   ├── ocr_wizard_bloc.dart                ← НОВО
│   ├── ocr_wizard_event.dart               ← НОВО
│   └── ocr_wizard_state.dart               ← НОВО
├── data/
│   └── repositories/
│       └── ocr_api_repository.dart         ← НОВО
└── screens/
    └── ocr_wizard_screen.dart              ← НОВО

branivo_app/test/features/ocr/
└── ocr_wizard_bloc_test.dart               ← НОВО

branivo_app/pubspec.yaml                    ← ПРОМЕНЕН (camera: ^0.11.0)
```

### Зависимости от предишни Stories

**Story 3.1 (done):**
- `AnonymousSessionsService` и Redis key pattern `anon:{sessionId}:session` вече съществуват
- `SessionsModule` вече е в `AppModule` — не го добавяй отново, само го import-вай в `OcrModule`
- `X-Session-Token` header convention вече е установен

**Story 3.2 (review):**
- `end_clients` таблица вече съществува — `client_id` FK в `ocr_jobs` е nullable (клиентът може да е анонимен при OCR)
- `ClientsModule` вече е в `AppModule`
- Следваща migration след Story 3.2: `1710000009000` → Story 3.3 ползва `1710000010000`

**НЕ пренаписвай** файлове от Stories 3.1 и 3.2. Само ги **използвай**.

### Env Variables (нови за Story 3.3)

```bash
# Google Vision
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# или GOOGLE_CLOUD_KEY_FILE_JSON за production (base64 encoded JSON)

# AWS (вече трябва да са настроени от Stories 1.x — само нови)
DOCUMENTS_BUCKET_NAME=branivo-documents-{env}
# AWS_REGION, AWS credentials от ECS task role (без explicit keys)
```

### OCR Parsing — Bulgarian Vehicle Registration Fields

Bulgarian vehicle registration certificate (свидетелство за регистрация) има 2 части:

**Part I (Свидетелство за регистрация — Част I):**
- A: Регистрационен номер (license_plate) — напр. "СА 1234 АА"
- B: Дата на първа регистрация (first_registration_date)
- C.1.1: Марка (make)
- C.1.2: Тип/Вариант/Версия
- C.3: Търговско наименование (model)
- D.1: Категория (vehicle_type)

**Part II (Свидетелство за регистрация — Част II):**
- E: VIN номер (17 символа, само цифри и главни латински букви, без I/O/Q)
- P.1: Обем на двигателя в куб. см (engine_volume)
- P.3: Мощност в kW
- P.5: Вид гориво (fuel_type) — 1=бензин, 2=дизел, 3=LPG, 4=ел., 5=хибрид
- J: Категория МПС
- R: Цвят (color)
- S.1: Брой места

VIN валидация regex: `/^[A-HJ-NPR-Z0-9]{17}$/` — ползвай при parsing

### Previous Story Intelligence (3.2)

- `AuthModule` не exports JwtModule — всеки модул ползва собствен `JwtModule.registerAsync`
- `NotificationsModule` е празен — не разчитай на него за нищо
- BullMQ configuration: провери `app.module.ts` за `BullModule.forRoot()` с Redis config — не го дублирай
- `BaseRepository` extends pattern вече е установен от Story 1.x — ползвай го

### Git Intelligence (последни commits)

Последни patterns:
- `feat(story-3.2)` → ClientsModule, InlineRegistration, RegistrationBloc
- `fix(story-3.1)` → code review fixes: service tests, hook error handling
- Pattern: всеки story е отделен commit с `feat(story-X.Y):` prefix

**Lesson от Story 3.2 code review:** Unit тестовете за services трябва да mock-ват всички dependencies правилно — особено Redis инжекция (`@InjectRedis()`).

### Project Structure Notes

**Alignment с архитектурата:**
- `OcrModule` е candidate за Phase 3 extraction → строго спазвай module boundaries (само EventEmitter за cross-module events, не директни imports извън SessionsModule)
- BullMQ: 4-та queue `ocr-processing` — добави към съществуващия `BullModule.forRoot()` в app.module.ts (не нов forRoot)
- `MulterModule` за file uploads — `limits: { fileSize: 15 * 1024 * 1024 }` (15MB per file, NFR constraint)
- OCR rate limit: 10 req/min/IP (от `@nestjs/throttler` + Redis double protection)
- Flutter `camera` package: изисква минимум iOS 12.0 и Android API 21 — провери `minSdkVersion`

**Нови npm пакети (задължителни):**
```bash
# API
npm install @google-cloud/vision @aws-sdk/client-textract @aws-sdk/client-s3 @nestjs/platform-express multer
npm install -D @types/multer

# Flutter (pubspec.yaml)
camera: ^0.11.0
```

### References

- [Source: epics.md#Story 3.3] — User story, AC1-AC7, 3 photos flow, confidence thresholds
- [Source: architecture.md#Cross-Cutting Concerns #3] — OCR pipeline: Vision 15s → Textract 30s → manual fallback
- [Source: architecture.md#Technical Constraints — External dependencies] — Google Vision 15s/Textract 30s timeouts
- [Source: architecture.md#Authentication & Security] — Rate limiting 10 req/min/IP (OCR)
- [Source: architecture.md#Frontend Architecture — Flutter] — camera package, BLoC events pattern `{Feature}{Action}Event`
- [Source: architecture.md#Frontend Architecture — Next.js] — Framer Motion → DISABLED при prefers-reduced-motion
- [Source: architecture.md#BullMQ Queue Architecture] — 3 queues описани; OCR добавя 4-та `ocr-processing`
- [Source: Story 3.1 Dev Notes] — Redis session key pattern `anon:{sessionId}:session`, TTL 48h
- [Source: Story 3.2 Dev Notes] — Migration numbering: 1710000009000 → Story 3.3 = 1710000010000; BaseRepository pattern
- [Source: branivo-skill — Key Numbers] — OCR timeout 10s, confidence 0.85, S3 TTL 15min, OCR rate 10 req/min/IP
- [Source: architecture.md#NFR1] — OCR < 30 sec end-to-end

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Fixed `TooManyRequestsException` constructor incompatibility — replaced with `HttpException(JSON.stringify({...}), HttpStatus.TOO_MANY_REQUESTS)`
- Fixed `Object.entries/values` ESLint `no-unsafe-member-access` — added explicit `[string, OcrField | undefined]` type annotations
- Fixed `TS1272` isolated modules error for `Queue` / `Job` from `bull` — changed to `import type`
- Fixed `TS2564` strict property initialization in entity/DTOs — added `!` to all class properties
- Fixed `res.body` typed as `any` in supertest specs — cast via `as OcrScanResponseDto / OcrStatusResponseDto`

### Completion Notes List

- All 273 API tests pass, 80 Web tests pass, 23 Flutter tests pass
- `npm run lint` — 0 errors (72 warnings pre-existing from other modules)
- `npm run build` — success
- `npx tsc --noEmit` — success
- `flutter analyze --no-fatal-infos` — 1 pre-existing info in `client_auth_repository.dart` (not in story scope)
- OCR pipeline: Google Vision sync (10s timeout) → AWS Textract async (BullMQ, polling up to 30s) → manual fallback

### File List

**Backend (branivo-api)**
- `src/infrastructure/database/migrations/1710000010000-CreateOcrJobsTable.ts` — NEW
- `src/modules/ocr/entities/ocr-job.entity.ts` — NEW
- `src/modules/ocr/ocr-job.repository.ts` — NEW
- `src/modules/ocr/providers/google-vision.service.ts` — NEW
- `src/modules/ocr/providers/aws-textract.service.ts` — NEW
- `src/modules/ocr/ocr-queue.producer.ts` — NEW
- `src/modules/ocr/ocr.service.ts` — UPDATED
- `src/modules/ocr/ocr.processor.ts` — NEW
- `src/modules/ocr/ocr.controller.ts` — UPDATED
- `src/modules/ocr/dto/ocr-scan.dto.ts` — NEW
- `src/modules/ocr/dto/ocr-status.dto.ts` — NEW
- `src/modules/ocr/ocr.module.ts` — UPDATED
- `src/modules/ocr/ocr.service.spec.ts` — NEW
- `src/modules/ocr/ocr.controller.spec.ts` — NEW
- `src/infrastructure/queues/queue.module.ts` — UPDATED

**Web (branivo-web)**
- `src/app/[locale]/(client)/vehicles/components/ocr-wizard.tsx` — NEW
- `src/lib/hooks/use-ocr-scanning.ts` — NEW
- `src/app/api/v1/ocr/scan/route.ts` — NEW
- `src/app/api/v1/ocr/status/[jobId]/route.ts` — NEW
- `src/__tests__/client/ocr-wizard.test.tsx` — NEW
- `src/__tests__/hooks/use-ocr-scanning.test.ts` — NEW

**Flutter (branivo_app)**
- `pubspec.yaml` — UPDATED (camera: ^0.11.0)
- `ios/Runner/Info.plist` — UPDATED (NSCameraUsageDescription)
- `android/app/src/main/AndroidManifest.xml` — UPDATED (CAMERA permission)
- `lib/features/ocr/data/repositories/ocr_models.dart` — NEW
- `lib/features/ocr/data/repositories/ocr_api_repository.dart` — NEW
- `lib/features/ocr/bloc/ocr_wizard_event.dart` — NEW
- `lib/features/ocr/bloc/ocr_wizard_state.dart` — NEW
- `lib/features/ocr/bloc/ocr_wizard_bloc.dart` — NEW
- `lib/features/ocr/screens/ocr_wizard_screen.dart` — NEW
- `test/features/ocr/ocr_wizard_bloc_test.dart` — NEW

### Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-03-19 | Initial implementation — all 22 tasks complete | claude-sonnet-4-6 |
