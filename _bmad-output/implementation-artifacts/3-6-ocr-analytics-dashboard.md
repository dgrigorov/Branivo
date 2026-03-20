# Story 3.6: OCR Analytics Dashboard

Status: review

## Story

As a Super Admin,
I want to monitor OCR performance per field across all tenants,
So that I can detect quality degradation and take action before clients are impacted.

## Acceptance Criteria

1. **AC1 — Dashboard с per-field confidence score и fallback rate:**
   **Given** Super Admin opens OCR Analytics,
   **When** dashboard loads,
   **Then** вижда per-field confidence score (средно за всяко поле) и fallback rate (% jobs с AWS Textract) за всички тенанти

2. **AC2 — Автоматичен алерт при fallback rate > 20%:**
   **Given** fallback rate за дадено поле надхвърли 20%,
   **When** прагът бъде прекрачен,
   **Then** Super Admin получава автоматичен email алерт (чрез `EmailService`) с информация за проблемното поле и тенанта

3. **AC3 — Филтриране по тенант и дата:**
   **Given** OCR analytics данни,
   **When** Super Admin филтрира по тенант или дата (7/30 дни),
   **Then** dashboard показва drill-down до конкретен тенант и времеви период

4. **AC4 — Trend graph (7/30 дни):**
   **Given** поле с постоянно ниска надеждност,
   **When** Super Admin разглежда данните,
   **Then** вижда trend graph за последните 7 или 30 дни (aggregated по ден) за идентифициране на деградация

5. **AC5 — Super Admin access контрол:**
   **Given** заявка към analytics endpoint,
   **When** потребителят не е Super Admin,
   **Then** получава 403 Forbidden; endpoint е защитен с `@Roles('super_admin')`

6. **AC6 — Cross-tenant query (без RLS ограничение):**
   **Given** Super Admin прави analytics заявка,
   **When** данните се агрегират,
   **Then** се включват данни от ВСИЧКИ тенанти без tenant_id scope (заобикаляне на BaseRepository RLS)

## Tasks / Subtasks

### Backend — Analytics Service & Controller

- [x] **Task 1: `OcrAnalyticsService`** (AC: #1, #3, #4, #6)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr-analytics.service.ts` (НОВ)
  - [x] Инжектирай `DataSource` от TypeORM (директен достъп без RLS) — **НЕ** използвай `OcrJobRepository` (той е tenant-scoped!)
  - [x] `getAnalytics(filters: OcrAnalyticsFiltersDto): Promise<OcrAnalyticsResponseDto>`
    - Raw SQL query към `ocr_jobs` таблица БЕЗ `app.current_tenant_id` session var
    - Агрегиране: per-field average confidence, fallback rate (COUNT WHERE provider = 'aws_textract' / total)
    - Подкрепя: `tenantId?: string`, `days: 7 | 30` (default: 7)
  - [x] `getTrend(field: string, days: 7 | 30, tenantId?: string): Promise<OcrTrendPoint[]>`
    - Aggregated по ден: `date`, `avgConfidence`, `fallbackRate`
  - [x] `checkAndSendAlerts(): Promise<void>`
    - Изчислява fallback rate per field per tenant
    - За всяко поле с fallback rate > 0.20: изпраща email алерт чрез `EmailService`
    - Предотвратява дублиране: кешира изпратени алерти в Redis (`ocr_alert:{tenantId}:{field}` с TTL 3600)

- [x] **Task 2: `OcrAnalyticsController`** (AC: #1-#6)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr-analytics.controller.ts` (НОВ)
  - [x] Базов path: `GET /ocr/analytics`
  - [x] `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('super_admin')` — точно като `AdminTenantsController`
  - [x] `GET /ocr/analytics` — query params: `tenantId?`, `days?` (7|30)
  - [x] `GET /ocr/analytics/trend` — query params: `field`, `days?`, `tenantId?`
  - [x] **ВАЖНО:** Не добавяй `TenantResolutionMiddleware` — Super Admin endpoint-ите не изискват `x-tenant-id` header

- [x] **Task 3: DTOs** (AC: #1-#4)
  - [x] Файл: `branivo-api/src/modules/ocr/dto/ocr-analytics.dto.ts` (НОВ)
  - [x] `OcrAnalyticsFiltersDto`: `tenantId?: string (IsOptional + IsUUID)`, `days?: number (IsOptional + IsIn([7,30]))`
  - [x] `OcrFieldStat`: `{ fieldName: string; avgConfidence: number; fallbackRate: number; totalJobs: number }`
  - [x] `OcrAnalyticsResponseDto`: `{ stats: OcrFieldStat[]; tenantId?: string; days: number; generatedAt: string }`
  - [x] `OcrTrendPoint`: `{ date: string; avgConfidence: number; fallbackRate: number; totalJobs: number }`

- [x] **Task 4: OcrModule — регистрация** (AC: #1)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr.module.ts` (ОБНОВИ)
  - [x] Добави `OcrAnalyticsService` в `providers`
  - [x] Добави `OcrAnalyticsController` в `controllers`
  - [x] Добави `EmailService` в `providers` (ако не е вече)
  - [x] Провери дали `REDIS_CLIENT` е в providers (нужен за alert dedup кеш)

- [x] **Task 5: BullMQ scheduler за алерти** (AC: #2)
  - [x] Избор: `@nestjs/schedule` Cron в `OcrAnalyticsService` — `@Cron('0 * * * *')` (всеки час)

### Backend — Тестове

- [x] **Task 6: Unit тестове за `OcrAnalyticsService`** (AC: #1-#4, #6)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr-analytics.service.spec.ts` (НОВ)
  - [x] Mock `DataSource` с Jest (`createEntityManager()` и raw query)
  - [x] Mock `EmailService` + Redis client
  - [x] Тестове: `getAnalytics()` с и без tenantId, `getTrend()` за 7 и 30 дни, `checkAndSendAlerts()` изпраща email при >20%, не изпраща при <20%, dedup от Redis

- [x] **Task 7: Integration тестове за `OcrAnalyticsController`** (AC: #5, #6)
  - [x] Файл: `branivo-api/src/modules/ocr/ocr-analytics.controller.spec.ts` (НОВ)
  - [x] Тестове: GET /ocr/analytics 200 (super_admin), GET /ocr/analytics 403 (non-admin), query params validation

### Next.js Web

- [x] **Task 8: BFF route за analytics** (AC: #1-#4)
  - [x] Файл: `branivo-web/src/app/api/v1/ocr/analytics/route.ts` (НОВ)
  - [x] `GET` — проксира към `branivo-api/ocr/analytics` с `Authorization: Bearer` от server session
  - [x] Файл: `branivo-web/src/app/api/v1/ocr/analytics/trend/route.ts` (НОВ)
  - [x] `GET` — проксира към `branivo-api/ocr/analytics/trend`

- [x] **Task 9: `useOcrAnalytics` hook** (AC: #1-#4)
  - [x] Файл: `branivo-web/src/lib/hooks/use-ocr-analytics.ts` (НОВ)
  - [x] `getAnalytics(filters?: { tenantId?: string; days?: 7 | 30 })` — tanstack query
  - [x] `getTrend(field: string, days?: 7 | 30, tenantId?: string)` — tanstack query
  - [x] Loading/error states

- [x] **Task 10: `OcrAnalyticsPage`** (AC: #1-#4)
  - [x] Файл: `branivo-web/src/app/[locale]/(admin)/ocr-analytics/page.tsx` (НОВ)
  - [x] Следва **точно** същия layout pattern като `(admin)/tenants/page.tsx`
  - [x] `OcrFieldStatsTable` — таблица с полета, avg confidence, fallback rate, цветен badge (червен ако >20%)
  - [x] Filter controls: tenant dropdown + days toggle (7/30)
  - [x] Alert banner: ако някое поле е >20% → показва warning banner

- [x] **Task 11: `OcrTrendChart` компонент** (AC: #4)
  - [x] Файл: `branivo-web/src/app/[locale]/(admin)/ocr-analytics/components/ocr-trend-chart.tsx` (НОВ)
  - [x] Прост SVG line chart — без recharts/chart.js
  - [x] Показва trend за избрано поле: дни по X, avg confidence по Y

- [x] **Task 12: Next.js тестове** (AC: #1-#4)
  - [x] Файл: `branivo-web/src/__tests__/hooks/use-ocr-analytics.test.ts` (НОВ)
  - [x] 4 hook теста: getAnalytics success, getAnalytics error, getTrend success, filters
  - [x] Файл: `branivo-web/src/__tests__/admin/ocr-analytics-page.test.tsx` (НОВ)
  - [x] 2 page теста: renders stats table, shows alert badge when >20%

### Flutter — App Routing & OCR/Vehicles Integration

- [x] **Task 13: `app_router.dart` — пълна навигационна структура** (предпоставка за тестване)
  - [x] Файл: `branivo_app/lib/core/routing/app_router.dart` (ОБНОВИ — замени placeholders)
  - [x] Routes: `/` → VehicleListScreen, `/login` → LoginScreen, `/vehicles/scan` → OcrWizardScreen, `/vehicles/validate` → VehicleValidationScreen, `/vehicles` → VehicleListScreen
  - [x] `BlocProvider` за всеки screen с нужния bloc/repository
  - [x] `OcrWizardRouteArgs` и `VehicleValidateRouteArgs` за type-safe navigation extras

- [x] **Task 14: `main.dart` — DI и BlocProviders**
  - [x] Файл: `branivo_app/lib/main.dart` (ОБНОВИ)
  - [x] `MultiRepositoryProvider` на root ниво
  - [x] `OcrApiRepository`, `VehiclesRepository`, `VehicleApiRepository` инжектирани глобално
  - [x] `AppRouter.router` свързан с `MaterialApp.router`

- [x] **Task 15: Flutter routing тестове**
  - [x] Файл: `branivo_app/test/core/routing/app_router_test.dart` (НОВ)
  - [x] 3 теста: root route рендира VehicleListScreen, `/vehicles/scan` рендира OcrWizardScreen, `/login` рендира LoginScreen

## Dev Notes

### КРИТИЧНО: Cross-Tenant Query — Заобикаляне на RLS

Story 3.6 изисква **Super Admin** достъп до данни от ВСИЧКИ тенанти. `BaseRepository` и `OcrJobRepository` добавят `tenant_id` scope автоматично. **НЕ** използвай `OcrJobRepository` за analytics.

```typescript
// ocr-analytics.service.ts — директен DataSource (без tenant isolation)
import { Injectable, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class OcrAnalyticsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getAnalytics(filters: OcrAnalyticsFiltersDto): Promise<OcrAnalyticsResponseDto> {
    const days = filters.days ?? 7;
    const params: (string | number)[] = [days];
    let tenantFilter = '';
    if (filters.tenantId) {
      params.push(filters.tenantId);
      tenantFilter = `AND tenant_id = $${params.length}`;
    }

    const rows = await this.dataSource.query<RawOcrStat[]>(`
      SELECT
        key AS field_name,
        AVG((value::jsonb->>'confidence')::float) AS avg_confidence,
        COUNT(*) FILTER (WHERE provider = 'aws_textract')::float / COUNT(*) AS fallback_rate,
        COUNT(*) AS total_jobs
      FROM ocr_jobs,
           jsonb_each(confidence_scores)
      WHERE status = 'completed'
        AND created_at >= NOW() - INTERVAL '${days} days'
        ${tenantFilter}
        AND deleted_at IS NULL
      GROUP BY key
      ORDER BY key
    `, params);

    return {
      stats: rows.map(r => ({
        fieldName: r.field_name,
        avgConfidence: parseFloat(String(r.avg_confidence)),
        fallbackRate: parseFloat(String(r.fallback_rate)),
        totalJobs: parseInt(String(r.total_jobs), 10),
      })),
      tenantId: filters.tenantId,
      days,
      generatedAt: new Date().toISOString(),
    };
  }
}
```

**ВНИМАНИЕ:** Не добавяй `SET app.current_tenant_id` преди тези заявки — RLS трябва да е ИЗКЛЮЧЕНА за Super Admin analytics.

### Super Admin Auth Pattern

```typescript
// Точно като AdminTenantsController
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('ocr/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class OcrAnalyticsController {
  // ...
}
```

Не добавяй `TenantResolutionMiddleware` за Super Admin контролери — те не изискват `x-tenant-id` header.

### Email Alert Pattern

```typescript
// Следвай EmailService.sendWithRetry pattern
// Нов метод в EmailService:
async sendOcrAlertEmail(
  to: string,         // super_admin email от ConfigService
  field: string,
  fallbackRate: number,
  tenantId: string,
): Promise<void>

// Redis dedup key:
const alertKey = `ocr_alert:${tenantId}:${field}`;
const alreadySent = await this.redis.exists(alertKey);
if (alreadySent) return;
await this.emailService.sendOcrAlertEmail(...);
await this.redis.setex(alertKey, 3600, '1'); // 1 час TTL
```

Вземи Super Admin email от ConfigService: `SUPER_ADMIN_ALERT_EMAIL` env var.

### Scheduler Pattern — @nestjs/schedule

```typescript
// В OcrAnalyticsService — без нов BullMQ queue
import { Cron } from '@nestjs/schedule';

@Cron('0 * * * *') // всеки час
async handleOcrAlertCheck(): Promise<void> {
  await this.checkAndSendAlerts();
}
```

За да работи: `ScheduleModule.forRoot()` трябва да е в `AppModule` — провери дали е добавен.

### OCR Fields в ocr_jobs.confidence_scores JSONB

Структурата на `confidence_scores` JSONB column:
```json
{
  "license_plate": 0.97,
  "vin": 0.85,
  "make": 0.92,
  "model": 0.88,
  "year": 0.95,
  "color": 0.70,
  "engine_volume": 0.65,
  "fuel_type": 0.80,
  "first_registration_date": 0.78
}
```

Тези са точно 9-те полета дефинирани в `OcrFieldResult` интерфейса в `ocr-job.entity.ts`.

### Trend Query Pattern

```sql
SELECT
  DATE_TRUNC('day', created_at) AS date,
  AVG((confidence_scores->>$1)::float) AS avg_confidence,
  COUNT(*) FILTER (WHERE provider = 'aws_textract')::float / COUNT(*) AS fallback_rate,
  COUNT(*) AS total_jobs
FROM ocr_jobs
WHERE status = 'completed'
  AND confidence_scores ? $1     -- поле съществува
  AND created_at >= NOW() - INTERVAL '7 days'
  AND deleted_at IS NULL
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date ASC
```

### Next.js Admin Layout

Страницата живее в `(admin)` route group — следва pattern на `(admin)/tenants/page.tsx`:
- `'use client'` + `useQuery` от `@tanstack/react-query`
- Tailwind CSS без допълнителни UI libraries
- Fetch към `/api/v1/ocr/analytics` BFF route
- Auth: server session cookie (`credentials: 'include'`)

**Нов BFF route:** `branivo-web/src/app/api/v1/ocr/analytics/route.ts` — проксира към `branivo-api`. Следвай pattern на `branivo-web/src/app/api/v1/admin/tenants/[id]/status/route.ts`.

### Fallback Rate Threshold Alert UI

```tsx
// In OcrAnalyticsPage
{stats.some(s => s.fallbackRate > 0.20) && (
  <div className="mb-4 rounded border border-yellow-300 bg-yellow-50 p-4">
    <p className="text-sm font-medium text-yellow-800">
      ⚠️ Внимание: Едно или повече полета имат fallback rate &gt; 20%
    </p>
  </div>
)}

// Per-row badge
<span className={s.fallbackRate > 0.20
  ? 'bg-red-100 text-red-800'
  : 'bg-green-100 text-green-800'
}>
  {(s.fallbackRate * 100).toFixed(1)}%
</span>
```

### Зависимости от предишни Stories

**Story 3.3 (done):**
- `ocr_jobs` таблица съществува с `confidence_scores JSONB`, `provider enum`, `status enum`, `tenant_id`
- `OcrJobRepository` е `BaseRepository<OcrJobEntity>` — **НЕ** го използвай за analytics (tenant-scoped)
- `OcrJobStatus.COMPLETED = 'completed'`, `OcrProvider.AWS_TEXTRACT = 'aws_textract'`

**Story 1.4 (done):**
- `AdminTenantsController` pattern — `@Roles('super_admin')`, `@UseGuards(JwtAuthGuard, RolesGuard)`
- `EmailService.sendWithRetry()` съществува — добавяй нов метод `sendOcrAlertEmail()`

**Story 3.5 (review):**
- `@Inject(REDIS_CLIENT)` pattern — **НЕ** `@InjectRedis()`
- `res.body` в supertest: cast с `as MyResponseDto` — без `any`

### Previous Story Intelligence (3.5)

- `@Inject(REDIS_CLIENT)` pattern — задължителен за Redis injection
- TypeScript: `!` postfix assertion за class properties
- `import type` за типове при `isolatedModules` + `emitDecoratorMetadata`
- Mock pattern: `{ provide: ServiceName, useValue: mockService }` за NestJS тестове
- Supertest `res.body` → cast с `as ResponseDto`
- `Object.entries` → explicit тип анотации `([k, v]: [string, ValueType])`

### Git Intelligence

```
Последна migration: 1710000011000-CreateVehiclesTable.ts
Story 3.6 НЕ изисква нова migration (чете само от ocr_jobs — вече съществуваща таблица)

Story 3.6 branch:  feature/story-3-6-ocr-analytics-dashboard
Commit format:     feat(story-3.6): OCR Analytics Dashboard
PR title:          feat(story-3.6): OCR Analytics Dashboard
PR base:           main  ← ЗАДЪЛЖИТЕЛНО --base main
```

### Файлова Структура

```
branivo-api/src/modules/ocr/
├── dto/
│   └── ocr-analytics.dto.ts                   ← НОВО
├── ocr-analytics.service.ts                   ← НОВО
├── ocr-analytics.service.spec.ts              ← НОВО
├── ocr-analytics.controller.ts                ← НОВО
├── ocr-analytics.controller.spec.ts           ← НОВО
└── ocr.module.ts                              ← ОБНОВЕН (добавени providers/controllers)

branivo-api/src/common/email/email.service.ts  ← ОБНОВЕН (нов метод sendOcrAlertEmail)

branivo-web/src/app/api/v1/ocr/analytics/
├── route.ts                                    ← НОВО (GET analytics)
└── trend/
    └── route.ts                                ← НОВО (GET trend)

branivo-web/src/lib/hooks/
└── use-ocr-analytics.ts                        ← НОВО

branivo-web/src/app/[locale]/(admin)/ocr-analytics/
├── page.tsx                                    ← НОВО (OcrAnalyticsPage)
└── components/
    └── ocr-trend-chart.tsx                     ← НОВО (OcrTrendChart)

branivo-web/src/__tests__/hooks/
└── use-ocr-analytics.test.ts                  ← НОВО

branivo-web/src/__tests__/admin/
└── ocr-analytics-page.test.tsx                ← НОВО
```

branivo_app/lib/core/routing/
└── app_router.dart                             ← ОБНОВЕН (реални routes, без placeholders)

branivo_app/lib/main.dart                       ← ОБНОВЕН (MultiRepositoryProvider, AppRouter)

branivo_app/test/core/routing/
└── app_router_test.dart                        ← НОВО

**Забележка:** Flutter Tasks 13-15 са prerequisite за тестване на OCR flow от устройство и генериране на реални OCR jobs в DB за analytics dashboard.

### Project Structure Notes

- Super Admin контролерите **не** минават през `TenantResolutionMiddleware` — провери `app.module.ts` как е конфигуриран middleware-ът
- `ScheduleModule.forRoot()` трябва да е в `AppModule` — добави ако липсва
- `OcrAnalyticsController` добавя нови routes под `/ocr/...` — не конфликтва с `OcrController` (POST /ocr/scan, GET /ocr/status/:jobId)
- BFF routes за analytics са под `/api/v1/ocr/analytics/` — не конфликтват с `/api/v1/ocr/scan` и `/api/v1/ocr/status/[jobId]`

### References

- [Source: epics.md#Story 3.6] — User story, AC1-AC4, analytics requirements
- [Source: epics.md#FR22] — "Super Admin OCR Analytics Dashboard с per-field confidence score и fallback rate; автоматичен алерт при fallback rate > 20%"
- [Source: branivo-api/src/modules/ocr/entities/ocr-job.entity.ts] — `OcrJobEntity`, `OcrFieldResult`, `confidence_scores JSONB`, `OcrProvider` enum
- [Source: branivo-api/src/modules/admin/admin-tenants.controller.ts] — Super Admin auth pattern с `@Roles('super_admin')`, `JwtAuthGuard`, `RolesGuard`
- [Source: branivo-api/src/common/email/email.service.ts] — `sendWithRetry()` pattern, SendGrid via nodemailer
- [Source: branivo-api/src/modules/ocr/ocr-job.repository.ts] — `BaseRepository` — НЕ използвай за cross-tenant analytics
- [Source: branivo-web/src/app/[locale]/(admin)/tenants/page.tsx] — Admin page pattern (useQuery, Tailwind, credentials: 'include')
- [Source: Story 3.5 Dev Notes] — Redis inject pattern, TypeScript no-any rules, mock patterns

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(none)

### Completion Notes List

- Имплементирани 15 tasks: Backend (NestJS), Next.js Web (BFF + UI), Flutter (routing + DI)
- `OcrAnalyticsService` ползва директен `DataSource.query()` БЕЗ `OcrJobRepository` — заобикаля RLS за cross-tenant analytics
- Алерт scheduler: `@Cron('0 * * * *')` в сервиса — `ScheduleModule.forRoot()` вече е в AppModule
- Redis dedup: `ocr_alert:{tenantId}:{field}` ключ с TTL 3600 секунди
- `EmailService.sendOcrAlertEmail()` добавен като нов публичен метод
- OcrTrendChart: прост SVG без external chart library
- Flutter routing: type-safe `OcrWizardRouteArgs` и `VehicleValidateRouteArgs` за screen parameters
- `widget_test.dart` обновен да предоставя `MultiRepositoryProvider` с mock repositories
- Резултати от тестове: API 314/314, Web 105/105, Flutter 36/36

### File List

- `branivo-api/src/modules/ocr/dto/ocr-analytics.dto.ts` (НОВ)
- `branivo-api/src/modules/ocr/ocr-analytics.service.ts` (НОВ)
- `branivo-api/src/modules/ocr/ocr-analytics.service.spec.ts` (НОВ)
- `branivo-api/src/modules/ocr/ocr-analytics.controller.ts` (НОВ)
- `branivo-api/src/modules/ocr/ocr-analytics.controller.spec.ts` (НОВ)
- `branivo-api/src/modules/ocr/ocr.module.ts` (ОБНОВЕН)
- `branivo-api/src/common/email/email.service.ts` (ОБНОВЕН — нов метод sendOcrAlertEmail)
- `branivo-web/src/app/api/v1/ocr/analytics/route.ts` (НОВ)
- `branivo-web/src/app/api/v1/ocr/analytics/trend/route.ts` (НОВ)
- `branivo-web/src/lib/hooks/use-ocr-analytics.ts` (НОВ)
- `branivo-web/src/app/[locale]/(admin)/ocr-analytics/page.tsx` (НОВ)
- `branivo-web/src/app/[locale]/(admin)/ocr-analytics/components/ocr-trend-chart.tsx` (НОВ)
- `branivo-web/src/__tests__/hooks/use-ocr-analytics.test.ts` (НОВ)
- `branivo-web/src/__tests__/admin/ocr-analytics-page.test.tsx` (НОВ)
- `branivo_app/lib/core/routing/app_router.dart` (ОБНОВЕН)
- `branivo_app/lib/main.dart` (ОБНОВЕН)
- `branivo_app/test/core/routing/app_router_test.dart` (НОВ)
- `branivo_app/test/widget_test.dart` (ОБНОВЕН)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (ОБНОВЕН)
