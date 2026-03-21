# Story 4.4: Policy Document Delivery

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an end-client,
I want to receive my policy PDF and Green Card by email and access them offline,
so that I always have proof of insurance available even without internet.

## Acceptance Criteria

1. **AC1 — Асинхронна PDF генерация и имейл доставка:**
   **Given** policy activation triggers PDF generation job (queue: `pdf-generation`, job name: `'generate-policy-pdf'`),
   **When** job е обработен,
   **Then** policy PDF и Green Card PDF се генерират асинхронно и се изпращат на имейл в < 5 мин след плащане

2. **AC2 — S3 съхранение с правилна структура:**
   **Given** PDF е генериран,
   **When** се съхранява в S3,
   **Then** ключовете следват структурата:
   - Policy PDF: `{tenantId}/{year}/{month}/policy/{policyId}.pdf`
   - Green Card: `{tenantId}/{year}/{month}/green-card/{policyId}.pdf`
   Документите **не** са публично достъпни (без ACL public-read)

3. **AC3 — Presigned URL с TTL 15 мин:**
   **Given** client иска достъп до документ,
   **When** URL е генериран,
   **Then** Signed URL с TTL 15 мин (900 сек) се връща — директен S3 достъп е забранен; `insurer.api_key_enc` **никога** не се връща в GET отговор

4. **AC4 — BullMQ retry с dead letter queue:**
   **Given** PDF generation job fail-ва,
   **When** BullMQ retry се изпълни,
   **Then** retry с exponential backoff (3 опита); след 3 неуспешни → dead letter queue + broker notification

5. **AC5 — PWA offline достъп:**
   **Given** client е на PWA,
   **When** policy document е получен,
   **Then** Service Worker кешира policy list локално; PDF документите са достъпни чрез presigned URLs

6. **AC6 — Flutter offline wallet:**
   **Given** client е в Flutter app,
   **When** отваря Policy Wallet,
   **Then** Hive кешира policy metadata локално; PDF се отваря в browser чрез `url_launcher` с presigned URL от API

## Tasks / Subtasks

### Backend — Нови пакети

- [ ] **Task 1: Инсталирай нови npm пакети** (AC: #1, #2, #3)
  - [ ] `npm install pdfkit @types/pdfkit` — чиста JS PDF библиотека, без Chrome, идеална за ECS Fargate
  - [ ] `npm install @aws-sdk/s3-request-presigner` — presigned URLs
  - [ ] Провери lint след инсталация: `cd branivo-api && npm run lint`

### Backend — DB Migration

- [ ] **Task 2: Migration — Добави PDF колони към `policies` таблицата** (AC: #2, #3)
  - [ ] Файл: `branivo-api/src/infrastructure/database/migrations/1710000016000-AddPdfColumnsToPolicy.ts`
  - [ ] Нови колони:
    ```sql
    policy_pdf_s3_key VARCHAR(500) NULLABLE
    green_card_pdf_s3_key VARCHAR(500) NULLABLE
    documents_emailed_at TIMESTAMPTZ NULLABLE
    ```
  - [ ] Използвай `ALTER TABLE policies ADD COLUMN IF NOT EXISTS ...`

### Backend — Entity Update

- [ ] **Task 3: Update `Policy` entity** (AC: #2, #3)
  - [ ] Файл: `branivo-api/src/modules/policies/entities/policy.entity.ts`
  - [ ] Добави нови полета:
    ```typescript
    @Column({ name: 'policy_pdf_s3_key', nullable: true })
    policyPdfS3Key?: string;

    @Column({ name: 'green_card_pdf_s3_key', nullable: true })
    greenCardPdfS3Key?: string;

    @Column({ name: 'documents_emailed_at', type: 'timestamptz', nullable: true })
    documentsEmailedAt?: Date;
    ```

### Backend — S3Service Extension

- [ ] **Task 4: Extend `S3Service`** (AC: #2, #3)
  - [ ] Файл: `branivo-api/src/infrastructure/s3/s3.service.ts`
  - [ ] Добави метод за upload на документи (private, without ACL):
    ```typescript
    async uploadPolicyDocument(key: string, buffer: Buffer): Promise<void>
    // PutObjectCommand без ACL — документи са private
    ```
  - [ ] Добави метод за presigned URL:
    ```typescript
    async generatePresignedUrl(key: string, expiresInSeconds: number): Promise<string>
    // Ползва @aws-sdk/s3-request-presigner: getSignedUrl(client, new GetObjectCommand({...}), { expiresIn })
    ```
  - [ ] **ВАЖНО:** `GetObjectCommand` е за download — import-ни от `@aws-sdk/client-s3`
  - [ ] **КРИТИЧНО:** Никога не излагай `AWS_SECRET_ACCESS_KEY` в response-и

### Backend — Email Service

- [ ] **Task 5: Създай `EmailService`** (AC: #1)
  - [ ] Файл: `branivo-api/src/infrastructure/email/email.service.ts`
  - [ ] Модул: `branivo-api/src/infrastructure/email/email.module.ts`
  - [ ] Ползва `nodemailer` (вече инсталиран v8.0.3)
  - [ ] Метод:
    ```typescript
    async sendPolicyDocuments(params: {
      to: string;
      policyNumber: string;
      policyPdfUrl: string;
      greenCardUrl: string;
      tenantName: string;
    }): Promise<void>
    // SMTP config: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars
    // Subject: `Вашата полица ${policyNumber} е готова`
    // HTML body: линкове към двата документа (presigned URLs)
    ```
  - [ ] Env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

### Backend — PDF Generation Service

- [ ] **Task 6: Създай `PdfGenerationService`** (AC: #1, #2, #3, #4)
  - [ ] Файл: `branivo-api/src/modules/policies/pdf-generation.service.ts`
  - [ ] Инжектирай: `PoliciesRepository`, `PolicyEventsRepository`, `S3Service`, `EmailService`, `EndClientsRepository` (или само полетата от policy)
  - [ ] Главен метод:
    ```typescript
    async generateAndDeliverDocuments(payload: PdfGenerationJobPayload): Promise<void>
    ```
  - [ ] **Стъпки в generateAndDeliverDocuments:**
    1. Вземи policy по `policyId` БЕЗ tenant scope (`findByIdWithoutScope`)
    2. Вземи end_client email (ако `endClientId` е наличен — от `end_clients` таблицата)
    3. Генерирай policy PDF buffer с `pdfkit`
    4. Генерирай green card PDF buffer с `pdfkit`
    5. Изчисли S3 ключове:
       - `{tenantId}/{year}/{month}/policy/{policyId}.pdf`
       - `{tenantId}/{year}/{month}/green-card/{policyId}.pdf`
    6. Upload двата файла с `S3Service.uploadPolicyDocument()`
    7. Update policy record: `policyPdfS3Key`, `greenCardPdfS3Key` (в `PoliciesRepository`)
    8. Generate presigned URLs (TTL 900 сек = 15 мин)
    9. Изпрати имейл с `EmailService.sendPolicyDocuments()`
    10. Update `documentsEmailedAt = new Date()`
    11. Създай immutable `policy_events` запис: `eventType: 'policy.documents_delivered'`

  - [ ] **PDF съдържание с pdfkit** — минимален MVP:
    ```typescript
    // policy.pdf — задължителни полета:
    // - Номер на полица: policy.policyNumber
    // - Статус: АКТИВНА
    // - Застрахователна компания: insurer name (от insurer entity)
    // - Период: policy.coverageStartDate — policy.coverageEndDate
    // - Сума: policy.premiumAmount policy.currency

    // green-card.pdf — стандартен ЕС формат:
    // - Policy number, insurer, vehicle, period
    ```

### Backend — PoliciesRepository нови методи

- [ ] **Task 7: Добави нови методи в `PoliciesRepository`** (AC: #1, #3)
  - [ ] Файл: `branivo-api/src/modules/policies/policies.repository.ts`
  - [ ] `findByIdWithoutScope(id: string): Promise<Policy | null>` — за job context (без tenant scope)
  - [ ] `updatePdfKeys(id: string, policyPdfKey: string, greenCardKey: string): Promise<void>`
  - [ ] `markDocumentsEmailed(id: string): Promise<void>` — `documentsEmailedAt = new Date()`

### Backend — PdfGenerationProcessor Update

- [ ] **Task 8: Update `PdfGenerationProcessor`** (AC: #1, #4)
  - [ ] Файл: `branivo-api/src/modules/policies/pdf-generation.processor.ts`
  - [ ] **АРХИТЕКТУРНО ПРАВИЛО:** MAX 20 реда — само dispatch, никаква бизнес логика
  - [ ] Job name: `'generate-policy-pdf'` (СЪВПАДА с stripe-webhook.service.ts — НЕ промени!)
  - [ ] Инжектирай `PdfGenerationService`
  - [ ] Имплементация:
    ```typescript
    @Process('generate-policy-pdf')
    async process(job: Job<PdfGenerationJobPayload>): Promise<void> {
      await this.pdfGenerationService.generateAndDeliverDocuments(job.data);
    }
    ```
  - [ ] BullMQ retry (вече конфигуриран в QueueModule): 3 attempts, exponential backoff delay 2000ms

### Backend — PoliciesController нов ендпойнт

- [ ] **Task 9: `GET /api/v1/policies/:id/documents`** (AC: #3)
  - [ ] Файл: `branivo-api/src/modules/policies/policies.controller.ts`
  - [ ] Auth: `@UseGuards(JwtAuthGuard)` — изисква автентикация
  - [ ] Tenant-scoped: вземи policy само за текущия tenant
  - [ ] Response DTO:
    ```typescript
    export class PolicyDocumentsResponseDto {
      policyPdfUrl!: string;    // presigned URL, TTL 15 мин
      greenCardUrl!: string;    // presigned URL, TTL 15 мин
      expiresAt!: string;       // ISO string: new Date(Date.now() + 900_000).toISOString()
    }
    ```
  - [ ] Ако `policyPdfS3Key` е null → 404 (документите още не са генерирани)
  - [ ] **КРИТИЧНО:** `insurer.api_key_enc` **никога** не се връща в GET отговор

### Backend — PoliciesModule Update

- [ ] **Task 10: Update `PoliciesModule`** (AC: #1)
  - [ ] Файл: `branivo-api/src/modules/policies/policies.module.ts`
  - [ ] Добави imports: `S3Module`, `EmailModule`
  - [ ] Добави providers: `PdfGenerationService`
  - [ ] Exports: добави `PdfGenerationService` ако е нужен навън

### Backend — Seed Update

- [ ] **Task 11: Update Seed (опционален за dev)** (AC: #1)
  - [ ] Файл: `branivo-api/src/infrastructure/database/seed.service.ts`
  - [ ] Добави SMTP конфигурация в `.env` примера: `SMTP_HOST=localhost SMTP_PORT=1025` (за Mailhog в dev)

### Backend — Тестове

- [ ] **Task 12: Unit тест `PdfGenerationService`** (AC: #1, #2, #3, #4)
  - [ ] Файл: `branivo-api/src/modules/policies/pdf-generation.service.spec.ts`
  - [ ] Тести:
    - `generateAndDeliverDocuments` calls S3Service.uploadPolicyDocument twice
    - `generateAndDeliverDocuments` calls EmailService.sendPolicyDocuments with presigned URLs
    - `generateAndDeliverDocuments` updates policy record with S3 keys
    - `generateAndDeliverDocuments` creates policy_events record
    - S3 key format: `{tenantId}/{year}/{month}/policy/{policyId}.pdf`

- [ ] **Task 13: Unit тест `PoliciesController` (documents endpoint)**
  - [ ] Файл: `branivo-api/src/modules/policies/policies.controller.spec.ts`
  - [ ] Тести:
    - Returns 200 with presigned URLs when documents exist
    - Returns 404 when policyPdfS3Key is null
    - Requires JWT auth

---

### PWA (branivo-web)

- [ ] **Task 14: Policy Wallet page** (AC: #5)
  - [ ] Файл: `branivo-web/src/app/(protected)/dashboard/wallet/page.tsx`
  - [ ] Показва списък с полиците на end-client
  - [ ] Бутони "Изтегли Полица" и "Изтегли Зелена карта" → `GET /api/v1/policies/:id/documents`
  - [ ] Presigned URLs се отварят в нов таб (`window.open(url, '_blank')`)
  - [ ] **PWA Service Worker** (next.config.js) вече кешира `/api/v1/policies` с `CacheFirst`
  - [ ] **Бележка:** Presigned URLs (15 мин TTL) НЕ се кешират от SW — само policy list-ът се кешира

- [ ] **Task 15: Component тест за PolicyWallet** (AC: #5)
  - [ ] Файл: `branivo-web/src/app/(protected)/dashboard/wallet/page.test.tsx`
  - [ ] Тества: render на policy list, document download buttons

---

### Flutter (branivo_app)

- [ ] **Task 16: Добави `url_launcher` в pubspec.yaml** (AC: #6)
  - [ ] `url_launcher: ^6.3.1` — за отваряне на presigned URLs в browser
  - [ ] `flutter pub get`

- [ ] **Task 17: Policy Wallet screen** (AC: #6)
  - [ ] Структура:
    ```
    branivo_app/lib/features/policies/
    ├── data/
    │   ├── models/policy_document.dart       # Hive model за offline cache
    │   └── repositories/policy_repository.dart
    ├── bloc/
    │   ├── policy_wallet_bloc.dart
    │   ├── policy_wallet_event.dart
    │   └── policy_wallet_state.dart
    └── presentation/screens/
        └── policy_wallet_screen.dart
    ```
  - [ ] `policy_document.dart` — Hive annotated модел:
    ```dart
    @HiveType(typeId: 10)  // следващ свободен typeId
    class PolicyDocument extends HiveObject {
      @HiveField(0) String policyId;
      @HiveField(1) String policyNumber;
      @HiveField(2) String status;
      @HiveField(3) DateTime? coverageStartDate;
      @HiveField(4) DateTime? coverageEndDate;
      @HiveField(5) double premiumAmount;
      @HiveField(6) String currency;
      @HiveField(7) DateTime cachedAt;
    }
    ```
  - [ ] `policy_repository.dart` — `GET /api/v1/policies` (list) + `GET /api/v1/policies/:id/documents`
  - [ ] `policy_wallet_screen.dart`:
    - Зарежда policies от API (Hive fallback ако offline)
    - "Отвори Полица" → `launchUrl(Uri.parse(presignedUrl))` чрез `url_launcher`
    - "Отвори Зелена карта" → `launchUrl(Uri.parse(greenCardUrl))`
    - Показва `expiresAt` като info текст ("Линкът е валиден 15 мин")

- [ ] **Task 18: Widget тест `PolicyWalletScreen`** (AC: #6)
  - [ ] Файл: `branivo_app/test/features/policies/presentation/policy_wallet_screen_test.dart`
  - [ ] Тества: render на policy list, offline fallback, URL launch

---

## Dev Notes

### Критични архитектурни правила

1. **НИКОГА** не активирай полица client-side — Story 4.3 вече обработва това
2. **НИКОГА** не връщай `insurer.api_key_enc` в GET отговор — включително в documents endpoint
3. **НИКОГА** не UPDATE или DELETE `policy_events` — immutable audit log
4. **НИКОГА** не давай public S3 ACL на policy документи — само presigned URLs
5. **ВИНАГИ** ползвай tenant_id scope за tenant-facing endpoints (PolicyWallet)
6. **BullMQ processor MAX 20 реда** — само dispatch към service

### PDF Job Name — КРИТИЧНО

Job name `'generate-policy-pdf'` е **хардкоднат** в 2 места:
- `stripe-webhook.service.ts` line 131: `await this.pdfQueue.add('generate-policy-pdf', ...)`
- `pdf-generation.processor.ts` line 11: `@Process('generate-policy-pdf')`

**НЕ ПРОМЕНИ job name-а** — архитектурата изисква `'pdf:generate'` naming, но текущият код ползва `'generate-policy-pdf'` и трябва да СЪВПАДА. Не рефакторирай в тази story.

### S3 Key Structure

```
Policy PDF:   {tenantId}/{year}/{month}/policy/{policyId}.pdf
Green Card:   {tenantId}/{year}/{month}/green-card/{policyId}.pdf
```

Пример: `tenant-uuid-here/2026/03/policy/policy-uuid-here.pdf`

Year/month се взимат от `new Date()` при генерацията на PDF.

### Presigned URL Details

```typescript
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
const url = await getSignedUrl(this.client, command, { expiresIn: 900 }); // 900 сек = 15 мин
```

### Existing Infrastructure (вече имплементирано в Story 4.3)

- ✅ `policies` таблица — вижте migration `1710000015000-CreatePoliciesTable.ts`
- ✅ `policy_events` таблица — immutable, без RLS
- ✅ `Policy` entity — `branivo-api/src/modules/policies/entities/policy.entity.ts`
- ✅ `PoliciesRepository` — `findByStripeIntentId()`, `findByIdForTenant()`, `activatePolicy()`
- ✅ `PolicyEventsRepository` — `createEvent()` (append-only)
- ✅ `PdfGenerationProcessor` — placeholder с `@Process('generate-policy-pdf')` → имплементирай в тази story
- ✅ BullMQ `pdf-generation` queue — регистриран в `QueueModule`
- ✅ `PdfGenerationJobPayload` interface — дефиниран в `stripe-webhook.service.ts`
- ✅ `S3Service` — `uploadLogo()` съществува; добави нови методи
- ✅ `nodemailer` v8.0.3 — инсталиран, без email service
- ✅ `@aws-sdk/client-s3` v3.1012.0 — инсталиран за S3 операции
- ✅ `next-pwa` v5.6.0 — PWA SW вече конфигуриран в `next.config.js`
- ✅ `hive` + `hive_flutter` — инсталирани в Flutter

### Нови пакети за инсталация

```bash
# API
cd branivo-api && npm install pdfkit @types/pdfkit @aws-sdk/s3-request-presigner

# Flutter
# В pubspec.yaml: добави url_launcher: ^6.3.1
cd branivo_app && flutter pub get
```

### Project Structure Notes

**Backend (NestJS):**
```
branivo-api/src/
├── infrastructure/
│   ├── email/
│   │   ├── email.module.ts     # НОВО
│   │   └── email.service.ts    # НОВО — nodemailer
│   └── s3/
│       └── s3.service.ts       # UPDATE — добави uploadPolicyDocument + generatePresignedUrl
├── database/migrations/
│   └── 1710000016000-AddPdfColumnsToPolicy.ts   # НОВО
└── modules/policies/
    ├── entities/
    │   └── policy.entity.ts    # UPDATE — добави PDF колони
    ├── pdf-generation.processor.ts  # UPDATE — inject PdfGenerationService + dispatch
    ├── pdf-generation.service.ts    # НОВО — main business logic
    ├── pdf-generation.service.spec.ts  # НОВО — unit тести
    ├── policies.controller.ts  # UPDATE — добави GET /policies/:id/documents
    ├── policies.module.ts      # UPDATE — добави EmailModule, S3Module, PdfGenerationService
    └── policies.repository.ts  # UPDATE — findByIdWithoutScope, updatePdfKeys, markDocumentsEmailed
```

**PWA (Next.js):**
```
branivo-web/src/app/(protected)/dashboard/
└── wallet/
    ├── page.tsx          # НОВО — Policy Wallet с offline поддръжка
    └── page.test.tsx     # НОВО — component тест
```

**Flutter:**
```
branivo_app/lib/features/policies/
├── data/
│   ├── models/policy_document.dart
│   └── repositories/policy_repository.dart
├── bloc/
│   ├── policy_wallet_bloc.dart
│   ├── policy_wallet_event.dart
│   └── policy_wallet_state.dart
└── presentation/screens/
    └── policy_wallet_screen.dart
```

### Env Vars (нови)

```env
# Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@branivo.com
SMTP_PASS=secret
SMTP_FROM="Branivo <noreply@branivo.com>"

# AWS (вече налични от Story 3.3)
AWS_REGION=eu-central-1
AWS_S3_BUCKET=branivo-documents-dev
```

### Git workflow (задължително преди имплементация)

```bash
git fetch origin
git switch main
git pull origin main
git switch -c feature/story-4-4-policy-document-delivery
```

### CI проверки преди PR

```bash
# API
cd branivo-api && npm run lint && npm run test:cov && npm run build

# Web
cd branivo-web && npm run lint && npx tsc --noEmit && npm run build

# Flutter
cd branivo_app && flutter analyze --no-fatal-infos && flutter test
```

### References

- Story 4.3 (previous): `_bmad-output/implementation-artifacts/4-3-policy-activation-via-stripe-webhook.md`
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — секция "BullMQ Queue Architecture" (line 80-85), S3 key structure (line 1306-1309)
- PRD: `_bmad-output/planning-artifacts/prd.md` — FR26-30 (PDF delivery, offline access)
- Existing S3Service: `branivo-api/src/infrastructure/s3/s3.service.ts`
- Existing processor placeholder: `branivo-api/src/modules/policies/pdf-generation.processor.ts`
- Existing BullMQ job setup: `branivo-api/src/modules/payments/stripe-webhook.service.ts` lines 129-143
- PWA SW config: `branivo-web/next.config.js`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
