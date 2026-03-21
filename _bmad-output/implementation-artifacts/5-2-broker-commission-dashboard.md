# Story 5.2: Broker Commission Dashboard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Broker,
I want to see my commissions and revenue in real time,
so that I always have an accurate picture of my earnings without waiting for webhooks.

## Acceptance Criteria

1. **AC1 — Незабавна видимост при активирана полица:**
   **Given** полица е активирана (Stripe webhook `payment_intent.succeeded`),
   **When** брокерът отвори Commission Dashboard,
   **Then** комисионата се показва незабавно — никога €0 за продадена полица

2. **AC2 — Перформанс < 3 секунди:**
   **Given** брокерът отваря Dashboard,
   **When** данните за комисиони се зареждат,
   **Then** страницата се зарежда в < 3 сек за последните 30 дни (default период)

3. **AC3 — Филтриране и breakdown per insurer:**
   **Given** брокерът преглежда приходите,
   **When** филтрира по date range или застраховател,
   **Then** вижда breakdown: брой полици, обща премия, комисиона per insurer

4. **AC4 — Stripe webhook потвърждение без UI flash:**
   **Given** Stripe webhook пристига след-факта за потвърждение,
   **When** е обработен,
   **Then** `pending_commission_event` се маркира като `confirmed` — UI не мига и не се нулира (статусът преминава от "обработва се" → "потвърден" плавно)

5. **AC5 — Детайли за конкретна полица:**
   **Given** брокерът преглежда списъка с комисиони,
   **When** кликне на конкретен ред,
   **Then** вижда: застраховател, продукт, премия, комисиона %, комисиона сума, статус (pending/confirmed)

6. **AC6 — Оptimistic UI преди webhook:**
   **Given** клиент е инициирал плащане (Payment Intent е създаден),
   **When** Stripe webhook още не е пристигнал,
   **Then** Dashboard показва pending_commission_event с индикатор "обработва се" — не €0

7. **AC7 — Tenant scope:**
   **Given** брокер е автентикиран с role `broker_admin`, `broker_agent` или `broker_viewer`,
   **When** извиква `GET /api/v1/commissions`,
   **Then** вижда само собствените данни (tenant-scoped) — никога данни на друг тенант

## Tasks / Subtasks

### Backend — DB Migration

- [x] **Task 1: Migration — Създай `pending_commission_events` таблица** (AC: #4, #6)
  - [x] Файл: `branivo-api/src/infrastructure/database/migrations/1710000019000-CreatePendingCommissionEvents.ts`
  - [x] SQL:
    ```sql
    CREATE TABLE IF NOT EXISTS pending_commission_events (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      payment_id      UUID NOT NULL REFERENCES payments(id),
      insurer_id      UUID NOT NULL REFERENCES insurers(id),
      product_type    VARCHAR(20) NOT NULL CHECK (product_type IN ('GO', 'KASKO', 'PROPERTY')),
      premium_amount  DECIMAL(10, 2) NOT NULL,
      commission_pct  DECIMAL(5, 4) NOT NULL,
      commission_amount DECIMAL(10, 2) NOT NULL,
      status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'confirmed', 'failed')),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pending_commission_events_tenant_id
      ON pending_commission_events(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_pending_commission_events_payment_id
      ON pending_commission_events(payment_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_commission_events_payment_unique
      ON pending_commission_events(payment_id);
    ```
  - [x] **Важно**: Има `tenant_id` за tenant scope, но **НЕ** изисква RLS (read-only query винаги включва `WHERE tenant_id = ?`)
  - [x] Без `deleted_at` — редовете се UPDATE-ват до 'confirmed'/'failed', не soft-delete

### Backend — Entity

- [x] **Task 2: Създай `PendingCommissionEvent` entity** (AC: #4, #6)
  - [x] Файл: `branivo-api/src/modules/commissions/entities/pending-commission-event.entity.ts`
  - [x] Полета: `id`, `tenantId`, `paymentId` (FK), `insurerId` (FK), `productType` (varchar), `premiumAmount`, `commissionPct`, `commissionAmount`, `status` (varchar), `createdAt`, `updatedAt`
  - [x] `@Column({ name: 'snake_case' })` задължително за всяко поле
  - [x] **Без** `deleted_at` — статусът се update-ва до confirmed/failed

### Backend — Repository

- [x] **Task 3: Разшири `CommissionsRepository`** (AC: #3, #4, #6, #7)
  - [x] Файл: `branivo-api/src/modules/commissions/commissions.repository.ts`
  - [x] Добави `@InjectRepository(PendingCommissionEvent)` в constructor
  - [x] Нови методи:
    - `createPendingEvent(data: CreatePendingEventData): Promise<PendingCommissionEvent>` — INSERT
    - `confirmPendingEvent(paymentId: string): Promise<void>` — UPDATE status='confirmed' WHERE payment_id=?
    - `failPendingEvent(paymentId: string): Promise<void>` — UPDATE status='failed' WHERE payment_id=?
    - `getDashboardData(tenantId: string, filters: DashboardFilters): Promise<DashboardRawData>` — aggregated query от `policies` (WHERE tenant_id=? AND status='active' AND created_at BETWEEN ?) + `pending_commission_events` (WHERE tenant_id=? AND status='pending')
  - [x] `getDashboardData` използва raw SQL за performance (JOIN с `insurers` за имена):
    ```sql
    -- Confirmed (от policies)
    SELECT p.id, p.insurer_id, i.name AS insurer_name, p.premium_amount,
           p.commission_pct, p.commission_amount, p.created_at,
           'confirmed' AS commission_status,
           p.metadata->>'productType' AS product_type
    FROM policies p
    JOIN insurers i ON i.id = p.insurer_id
    WHERE p.tenant_id = $1
      AND p.status = 'active'
      AND p.deleted_at IS NULL
      AND ($2::date IS NULL OR p.created_at >= $2)
      AND ($3::date IS NULL OR p.created_at <= $3)
      AND ($4::uuid IS NULL OR p.insurer_id = $4)

    UNION ALL

    -- Pending (от pending_commission_events)
    SELECT pce.id, pce.insurer_id, i.name AS insurer_name, pce.premium_amount,
           pce.commission_pct, pce.commission_amount, pce.created_at,
           'pending' AS commission_status,
           pce.product_type
    FROM pending_commission_events pce
    JOIN insurers i ON i.id = pce.insurer_id
    WHERE pce.tenant_id = $1
      AND pce.status = 'pending'
      AND ($2::date IS NULL OR pce.created_at >= $2)
      AND ($3::date IS NULL OR pce.created_at <= $3)
      AND ($4::uuid IS NULL OR pce.insurer_id = $4)

    ORDER BY created_at DESC
    ```

### Backend — DTOs

- [x] **Task 4: Създай DTO файлове за Dashboard** (AC: #3, #5)
  - [x] `branivo-api/src/modules/commissions/dto/commission-dashboard.dto.ts`
    - `CommissionDashboardQueryDto`: `dateFrom?: string`, `dateTo?: string`, `insurerId?: string`
    - `CommissionPolicyItemDto`: `id`, `insurerId`, `insurerName`, `productType`, `premiumAmount`, `commissionPct`, `commissionAmount`, `commissionStatus: 'confirmed' | 'pending'`, `createdAt`
    - `CommissionByInsurerDto`: `insurerId`, `insurerName`, `policiesCount`, `totalPremium`, `totalCommission`
    - `CommissionDashboardResponseDto`: `summary: { totalPolicies, totalPremium, totalCommission, currency }`, `byInsurer: CommissionByInsurerDto[]`, `policies: CommissionPolicyItemDto[]`

### Backend — Service

- [x] **Task 5: Разшири `CommissionsService`** (AC: #1, #2, #3, #4, #6)
  - [x] Файл: `branivo-api/src/modules/commissions/commissions.service.ts`
  - [x] Нови методи:
    - `createPendingEvent(tenantId: string, data: {...}): Promise<void>` — извиква `commissionsRepo.createPendingEvent()`
    - `confirmPendingEvent(paymentId: string): Promise<void>` — извиква `commissionsRepo.confirmPendingEvent()`
    - `failPendingEvent(paymentId: string): Promise<void>` — извиква `commissionsRepo.failPendingEvent()`
    - `getDashboardStats(tenantId: string, query: CommissionDashboardQueryDto): Promise<CommissionDashboardResponseDto>` — извиква `commissionsRepo.getDashboardData()`, агрегира по insurer, изчислява summary
  - [x] Default период в `getDashboardStats`: ако `dateFrom` не е подаден → last 30 days (`new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)`)
  - [x] `currency` в summary: винаги `'BGN'`

### Backend — Controller

- [x] **Task 6: Разшири `CommissionsController`** (AC: #2, #3, #5, #7)
  - [x] Файл: `branivo-api/src/modules/commissions/commissions.controller.ts`
  - [x] Добави нов endpoint: `GET /api/v1/commissions`
    - `@UseGuards(JwtAuthGuard, RolesGuard)`
    - `@Roles('broker_admin', 'broker_agent', 'broker_viewer')` на метода (не на controller ниво — Super Admin endpoints имат различна role)
    - Използва `TenantContext.getTenantId()` — **задължително** за tenant scope
    - `@Query() query: CommissionDashboardQueryDto`
    - Извиква `commissionsService.getDashboardStats(tenantId, query)`
  - [x] **Критично**: Съществуващите Super Admin endpoints (`GET /admin/commissions`, `PUT /admin/commissions/:id/:type`) **НЕ** използват TenantContext — не ги пипай
  - [x] Новият broker endpoint живее на `/commissions` (без `/admin/`) — различна роля и scope

### Backend — Module

- [x] **Task 7: Обнови `CommissionsModule`** (AC: #6 — integration с PaymentsModule)
  - [x] Файл: `branivo-api/src/modules/commissions/commissions.module.ts`
  - [x] Добави `TypeOrmModule.forFeature([CommissionMatrix, PendingCommissionEvent])`
  - [x] `exports: [CommissionsService]` остава непроменено

### Backend — Integration: PaymentsService

- [x] **Task 8: Обнови `PaymentsService` за Optimistic UI** (AC: #6)
  - [x] Файл: `branivo-api/src/modules/payments/payments.service.ts`
  - [x] След успешното `stripe.paymentIntents.create()` → извикай `commissionsService.createPendingEvent()` с:
    - `tenantId`: от `TenantContext.getTenantId()`
    - `paymentId`: новосъздаденото payment record id
    - `insurerId`: от quote
    - `productType`: от quote metadata (default: `'GO'`)
    - `premiumAmount`: сумата
    - `commissionPct`: от `commissionsService.getRate()` (вече е налично)
    - `commissionAmount`: `applicationFeeAmount / 100` (Stripe работи в стотинки)
  - [x] Wrap в `try/catch` — неуспешен pending event НЕ спира Payment Intent

### Backend — Integration: StripeWebhookService

- [x] **Task 9: Обнови `StripeWebhookService` за потвърждение** (AC: #4)
  - [x] Файл: `branivo-api/src/modules/payments/stripe-webhook.service.ts`
  - [x] Инжектирай `CommissionsService` в constructor (ако не е вече)
  - [x] В `handlePaymentIntentSucceeded()`: след успешно активиране на полицата → `await commissionsService.confirmPendingEvent(payment.id)`
  - [x] Wrap в `try/catch` — неуспешен confirm НЕ спира policy activation
  - [x] При `payment_intent.payment_failed` webhook → `commissionsService.failPendingEvent(payment.id)` (ако съществува)

### Backend — Seed данни

- [x] **Task 10: Обнови seed за комисионни данни** (AC: #1)
  - [x] Файл: `branivo-api/src/infrastructure/database/seed.service.ts`
  - [x] В метода `seedCommissionMatrix()` или нов `seedDemoCommissions()` — добави 3–5 demo policy records за demo тенанта ако таблицата е празна
  - [x] Алтернативно: seed 1–2 `pending_commission_events` за demo тенанта с статус 'pending'
  - [x] `ON CONFLICT ... DO NOTHING`

### Frontend (Next.js) — Commission Dashboard страница

- [x] **Task 11: Създай Commission Dashboard страница** (AC: #1, #2, #3, #5)
  - [x] Файл: `branivo-web/src/app/[locale]/(broker)/billing/page.tsx`
  - [x] `'use client'` компонент с TanStack Query
  - [x] Структура:
    - Summary cards: обща премия, обща комисиона, брой полици
    - Filters: date range picker (from/to), insurer dropdown
    - By insurer breakdown таблица
    - Policies list с колони: дата, застраховател, продукт, премия, % комисиона, сума, статус badge
  - [x] Статус badge: `pending` → жълт "Обработва се", `confirmed` → зелен "Потвърден"
  - [x] `staleTime: 30_000`, `refetchInterval: false` (не auto-poll — broker не очаква real-time stream)
  - [x] Skeleton loading (3 редa) при `isLoading`
  - [x] Empty state при 0 резултати
  - [x] Explicit TypeScript типове навсякъде — без `any`

- [x] **Task 12: Добави Next.js API route прокси** (AC: #7)
  - [x] Файл: `branivo-web/src/app/api/v1/commissions/route.ts` (GET)
  - [x] Прокси към `branivo-api` с Bearer token от cookie
  - [x] Forward query params: `dateFrom`, `dateTo`, `insurerId`
  - [x] Error handling: 401 → redirect to login, 500 → structured error response

### Тестове — Backend

- [x] **Task 13: Unit тест за `CommissionsService` — нови методи** (AC: #1, #4, #6)
  - [x] Файл: `branivo-api/src/modules/commissions/commissions.service.spec.ts` (разширен)
  - [x] Тества:
    - `createPendingEvent` — извиква repo.createPendingEvent с правилните данни
    - `confirmPendingEvent` — извиква repo.confirmPendingEvent с paymentId
    - `getDashboardStats` — агрегира данни, изчислява summary, default 30-day range
    - `getDashboardStats` с filters — подава dateFrom, dateTo, insurerId на repo

- [x] **Task 14: Integration тест за `CommissionsController` — broker endpoint** (AC: #3, #7)
  - [x] Файл: `branivo-api/src/modules/commissions/commissions.controller.spec.ts` (разширен)
  - [x] Тества:
    - `GET /api/v1/commissions` → 200 за broker_admin
    - `GET /api/v1/commissions?dateFrom=2026-01-01` → 200 с filtered данни
    - `GET /api/v1/commissions` → 403 за super_admin (wrong role)
    - TenantContext.getTenantId() се извиква за tenant scope

### Тестове — Frontend

- [x] **Task 15: Component тест за Commission Dashboard страница** (AC: #1, #3)
  - [x] Файл: `branivo-web/src/__tests__/broker/commission-dashboard.test.tsx`
  - [x] Тества: skeleton loading, summary cards rendering, policy list, pending badge, empty state

## Dev Notes

### Архитектурни изисквания

- **Optimistic UI pattern**: `pending_commission_events` се създава при `createPaymentIntent` → Dashboard я показва веднага с "обработва се" индикатор → При `payment_intent.succeeded` webhook → маркира се 'confirmed'. Никога €0 за инициирано плащане.

- **Commission snapshot е IMMUTABLE**: `commissionPct` и `commissionAmount` в `policies` таблицата са immutable snapshots. Story 5.2 само ЧЕТЕ от тях — никога не ги UPDATE-ва.

- **Tenant scope е ЗАДЪЛЖИТЕЛЕН**: `GET /api/v1/commissions` използва `TenantContext.getTenantId()`. Никога не показвай данни на друг тенант. За разлика — Super Admin endpoints (`/admin/commissions`) са platform-level и НЕ използват TenantContext.

- **RLS на pending_commission_events**: Таблицата има `tenant_id` но не е в RLS (за разлика от `policies`). Repository-ят ЗАДЪЛЖИТЕЛНО подава `WHERE tenant_id = $1` в `getDashboardData()`.

- **Производителност**: `getDashboardData()` е raw SQL UNION ALL за оptimal performance. Не зареждай всички policies в TypeORM entity и не агрегирай в JS — агрегирай в SQL.

### Съществуващ код и критични интеграционни точки

- **`branivo-api/src/modules/commissions/commissions.service.ts`**: `CommissionsService` вече е `@Injectable()` и exported — разширяваш го, не пренаписваш
- **`branivo-api/src/modules/commissions/commissions.repository.ts`**: `CommissionsRepository` вече съществува — добавяш нови методи; НЕ extends BaseRepository
- **`branivo-api/src/modules/payments/payments.service.ts`**: `CommissionsService` вече е инжектиран (Story 5.1 TODO е разрешен) — само добавяш `createPendingEvent()` call
- **`branivo-api/src/modules/payments/stripe-webhook.service.ts` ред 94+**: Policy се създава с `commissionAmount` и `commissionPct` snapshot — `confirmPendingEvent()` се добавя СЛЕД тази точка
- **`branivo-api/src/modules/policies/entities/policy.entity.ts`**: Полетата `commissionAmount` и `commissionPct` вече съществуват — не ги пипаш
- **`branivo-web/src/app/[locale]/(broker)/layout.tsx`**: Broker layout вече съществува — `(broker)/billing/page.tsx` автоматично ще го наследи
- **`branivo-web/src/app/[locale]/(broker)/users/page.tsx`**: Следвай точно този pattern — `useQuery`, fetch към `/api/v1/...` с `credentials: 'include'`, explicit TypeScript types

### Файлова структура

```
branivo-api/src/modules/commissions/
├── commissions.module.ts               (modified — add PendingCommissionEvent entity)
├── commissions.controller.ts           (modified — add GET /commissions broker endpoint)
├── commissions.service.ts              (modified — add createPendingEvent, confirmPendingEvent, getDashboardStats)
├── commissions.repository.ts           (modified — add pending event methods + getDashboardData)
├── dto/
│   ├── commission-dashboard.dto.ts     (new — query + response DTOs)
│   ├── upsert-commission-rate.dto.ts   (unchanged)
│   └── commission-matrix-response.dto.ts (unchanged)
├── enums/
│   └── product-type.enum.ts            (unchanged)
└── entities/
    ├── commission-matrix.entity.ts     (unchanged)
    └── pending-commission-event.entity.ts (new)

branivo-api/src/infrastructure/database/migrations/
└── 1710000019000-CreatePendingCommissionEvents.ts (new)

branivo-api/src/modules/payments/
├── payments.service.ts                 (modified — createPendingEvent call)
└── stripe-webhook.service.ts          (modified — confirmPendingEvent call)

branivo-web/src/app/[locale]/(broker)/billing/
└── page.tsx                            (new — Commission Dashboard)

branivo-web/src/app/api/v1/commissions/
└── route.ts                            (new — proxy GET)

branivo-web/src/__tests__/broker/
└── commission-dashboard.test.tsx       (new)
```

### API Pattern Reference

```typescript
// ✅ ПРАВИЛНО — Broker endpoint с TenantContext
@Controller('commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommissionsController {
  // ... existing Super Admin methods at /admin/commissions ...

  @Get()
  @Roles('broker_admin', 'broker_agent', 'broker_viewer')
  async getDashboard(
    @Query() query: CommissionDashboardQueryDto,
    // TenantContext се взима от NestJS DI — инжектиран в constructor
  ): Promise<{ data: CommissionDashboardResponseDto }> {
    const tenantId = this.tenantContext.getTenantId();
    const data = await this.commissionsService.getDashboardStats(tenantId, query);
    return { data };
  }
}

// ❌ ЗАБРАНЕНО за broker endpoint — не пропускай tenant scope
const allPolicies = await this.repo.findAll(); // без tenant_id scope!
```

### Миграционен timestamp

Последната миграция е `1710000018000-CreateCommissionMatrix.ts`.
Новата миграция трябва да е `1710000019000-CreatePendingCommissionEvents.ts`.

### policies.metadata → productType

`policies.metadata` е JSONB. При `getDashboardData()` raw SQL — достъпваш `p.metadata->>'productType'` за product type. Default стойност ако е NULL: `'GO'`.

### TransformInterceptor

Всички API responses са в `{ data, meta: { timestamp } }` формат — TransformInterceptor го прави автоматично. Връщай само `{ data }` от controller методите.

### Next.js proxy route pattern

Следвай съществуващия pattern от Story 5.1:
```typescript
// branivo-web/src/app/api/v1/commissions/route.ts
export async function GET(request: NextRequest): Promise<Response> {
  const token = cookies().get('access_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const apiUrl = `${process.env.API_URL}/api/v1/commissions${url.search}`;

  try {
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json() as unknown;
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Gateway error' }, { status: 502 });
  }
}
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Explicit Architectural Constraints] — Optimistic UI за commission (constraint #3), Commission Integrity (#10)
- [Source: _bmad-output/planning-artifacts/architecture.md#FR Domain → Component Mapping] — `billing/`, `commissions/` модули; `(broker)/billing/` frontend route
- [Source: _bmad-output/planning-artifacts/architecture.md#API Boundaries] — `GET /api/v1/commissions` (broker_admin role)
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Directory Structure] — `commissions/entities/pending-commission-event.entity.ts`
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2] — Acceptance criteria
- [Source: _bmad-output/implementation-artifacts/5-1-commission-matrix-configuration.md] — CommissionsService архитектура, patterns от Story 5.1
- [Source: branivo-api/src/modules/commissions/commissions.service.ts] — Съществуващ CommissionsService (injectable, exported)
- [Source: branivo-api/src/modules/commissions/commissions.repository.ts] — CommissionsRepository (не extends BaseRepository)
- [Source: branivo-api/src/modules/payments/stripe-webhook.service.ts:91-125] — Policy activation flow, commission snapshot
- [Source: branivo-api/src/modules/policies/entities/policy.entity.ts] — commissionAmount, commissionPct полета
- [Source: branivo-web/src/app/[locale]/(broker)/users/page.tsx] — Broker page pattern (useQuery, fetch, TypeScript types)
- [Source: branivo-web/src/app/[locale]/(broker)/layout.tsx] — Broker layout (наследено автоматично)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Реализиран Optimistic UI pattern: `pending_commission_events` таблица и entity, създава се при `createPaymentIntent`, потвърждава се при `payment_intent.succeeded` webhook, маркира се като 'failed' при `payment_intent.payment_failed`.
- Broker endpoint `GET /api/v1/commissions` добавен като отделен `BrokerCommissionsController` в `commissions.controller.ts` — tenant scope чрез `TenantContext.getTenantId()`.
- `getDashboardData` използва raw SQL UNION ALL — confirmed (от `policies` WHERE status='active') + pending (от `pending_commission_events` WHERE status='pending').
- Seed добавен: `seedDemoCommissions()` създава 1 demo pending event за demo тенанта.
- 417 API unit/integration тестa + 64 Flutter тестa минават. Zero lint warnings/errors.
- BrokerCommissionsController регистриран в CommissionsModule заедно с CommissionsController.

### File List

branivo-api/src/infrastructure/database/migrations/1710000019000-CreatePendingCommissionEvents.ts
branivo-api/src/infrastructure/database/seed.service.ts
branivo-api/src/modules/commissions/commissions.controller.ts
branivo-api/src/modules/commissions/commissions.controller.spec.ts
branivo-api/src/modules/commissions/commissions.module.ts
branivo-api/src/modules/commissions/commissions.repository.ts
branivo-api/src/modules/commissions/commissions.service.ts
branivo-api/src/modules/commissions/commissions.service.spec.ts
branivo-api/src/modules/commissions/dto/commission-dashboard.dto.ts
branivo-api/src/modules/commissions/entities/pending-commission-event.entity.ts
branivo-api/src/modules/payments/payments.service.ts
branivo-api/src/modules/payments/stripe-webhook.service.ts
branivo-api/src/modules/payments/stripe-webhook.service.spec.ts
branivo-web/src/app/[locale]/(broker)/billing/page.tsx
branivo-web/src/app/api/v1/commissions/route.ts
branivo-web/src/__tests__/broker/commission-dashboard.test.tsx
_bmad-output/implementation-artifacts/5-2-broker-commission-dashboard.md
_bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-03-21: Story 5.2 implemented — pending_commission_events table, PendingCommissionEvent entity, extended CommissionsRepository/Service/Controller (BrokerCommissionsController at GET /commissions), Optimistic UI integration in PaymentsService and StripeWebhookService, Commission Dashboard page (Next.js), API proxy route, seed data, 15 tasks completed with full test coverage.
- 2026-03-21: Code review fixes — dateTo filter inclusivity (< date+1day), float precision (round2 helper), extra DB query removed in PaymentsService, confirmPendingEvent/failPendingEvent assertions added in webhook spec, insurer dropdown filter added to UI, policy row click-to-select (AC5), input id/htmlFor for accessibility. 417 API + 147 web tests pass.
