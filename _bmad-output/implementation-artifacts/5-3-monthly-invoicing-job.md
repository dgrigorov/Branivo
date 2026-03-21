# Story 5.3: Monthly Invoicing Job

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Platform,
I want to automatically generate monthly invoices for each tenant,
so that billing is consistent, timely and auditable without manual intervention.

## Acceptance Criteria

1. **AC1 — Scheduled job on 1st of month:**
   **Given** it is the 1st day of the month,
   **When** 06:00 `Europe/Sofia` time is reached,
   **Then** BullMQ repeatable job (`{ pattern: '0 6 1 * *', tz: 'Europe/Sofia' }`) генерира фактура за всеки активен тенант

2. **AC2 — Invoice contents and persistence:**
   **Given** invoice is generated,
   **When** saved,
   **Then** съдържа: период (`period_start`, `period_end`), брой полици, обща премия, platform fee, subscription fee, дължима сума; записва се в `invoices` таблица

3. **AC3 — Pro-rata за mid-month активация:**
   **Given** тенантът е активиран в средата на предния месец,
   **When** invoice job се изпълни на 1-во число,
   **Then** subscription fee се изчислява pro-rata: `days_active / days_in_month × monthly_fee`; policy commissions са по реален брой полици без pro-rata

4. **AC4 — Super Admin алерт при failure:**
   **Given** billing job fail-ва за даден тенант,
   **When** грешката е засечена,
   **Then** Super Admin получава имейл алерт в < 15 мин (NFR11)

5. **AC5 — Manual re-run без дублиране:**
   **Given** Super Admin иска да пусне billing ръчно за конкретен тенант,
   **When** извика `POST /api/v1/admin/billing/run` с `{ tenantId }`,
   **Then** job се изпълнява незабавно само за засегнатия тенант; ако фактура за периода вече съществува → пропуска (idempotent — UNIQUE constraint на `(tenant_id, period_start)`)

6. **AC6 — Email с PDF фактура:**
   **Given** invoice е генерирана успешно,
   **When** тенантът е нотифициран,
   **Then** брокерът получава имейл с прикачена фактура в PDF формат

## Tasks / Subtasks

### Backend — DB Migration

- [ ] **Task 1: Migration — Създай `invoices` таблица** (AC: #2, #3, #5)
  - [ ] Файл: `branivo-api/src/infrastructure/database/migrations/1710000020000-CreateInvoices.ts`
  - [ ] SQL:
    ```sql
    CREATE TABLE IF NOT EXISTS invoices (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           UUID NOT NULL,
      period_start        DATE NOT NULL,
      period_end          DATE NOT NULL,
      policies_count      INTEGER NOT NULL DEFAULT 0,
      total_premium       DECIMAL(12, 2) NOT NULL DEFAULT 0,
      platform_fee        DECIMAL(12, 2) NOT NULL DEFAULT 0,
      subscription_fee    DECIMAL(10, 2) NOT NULL DEFAULT 0,
      amount_due          DECIMAL(12, 2) NOT NULL DEFAULT 0,
      is_pro_rata         BOOLEAN NOT NULL DEFAULT FALSE,
      days_active         INTEGER,
      pdf_url             VARCHAR(500),
      status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'paid', 'failed')),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at          TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_period
      ON invoices(tenant_id, period_start)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id
      ON invoices(tenant_id);
    ```
  - [ ] **Unique constraint** `(tenant_id, period_start)` осигурява idempotency — AC5
  - [ ] `deleted_at` — soft delete pattern (standard за проекта)
  - [ ] Следвай timestamp конвенция: предишната миграция е `1710000019000-CreatePendingCommissionEvents.ts`

### Backend — Entity

- [ ] **Task 2: Създай `Invoice` entity** (AC: #2)
  - [ ] Файл: `branivo-api/src/modules/billing/entities/invoice.entity.ts`
  - [ ] Полета: `id`, `tenantId`, `periodStart` (Date), `periodEnd` (Date), `policiesCount`, `totalPremium`, `platformFee`, `subscriptionFee`, `amountDue`, `isProRata` (boolean), `daysActive` (nullable int), `pdfUrl` (nullable string), `status` (varchar: 'pending'|'paid'|'failed'), `createdAt`, `updatedAt`, `deletedAt`
  - [ ] `@Column({ name: 'snake_case' })` задължително за всяко поле
  - [ ] `@Column({ type: 'date' })` за `periodStart` и `periodEnd`
  - [ ] `@Column({ type: 'decimal', precision: 12, scale: 2 })` за финансовите полета

### Backend — Repository

- [ ] **Task 3: Създай `BillingRepository`** (AC: #2, #3, #5)
  - [ ] Файл: `branivo-api/src/modules/billing/billing.repository.ts`
  - [ ] **Не** extends BaseRepository — директен `@InjectRepository(Invoice)` pattern (следва `CommissionsRepository` от Story 5.1)
  - [ ] Методи:
    - `createInvoice(data: CreateInvoiceData): Promise<Invoice>` — INSERT с ON CONFLICT DO NOTHING (или check uniqueness преди insert)
    - `findByTenantAndPeriod(tenantId: string, periodStart: Date): Promise<Invoice | null>` — за idempotency check
    - `findByTenant(tenantId: string): Promise<Invoice[]>` — за Super Admin view
    - `updateStatus(invoiceId: string, status: 'paid' | 'failed'): Promise<void>`
    - `updatePdfUrl(invoiceId: string, pdfUrl: string): Promise<void>`
  - [ ] **Критично**: Всяка заявка включва `WHERE tenant_id = $1` или е platform-level (Super Admin context)

### Backend — DTOs

- [ ] **Task 4: Създай DTO файлове** (AC: #5)
  - [ ] `branivo-api/src/modules/billing/dto/manual-billing-run.dto.ts`
    - `ManualBillingRunDto`: `tenantId?: string` (optional — без него → всички активни тенанти за текущия месец)
    - `@IsOptional()`, `@IsUUID()` validator decorators
  - [ ] `branivo-api/src/modules/billing/dto/invoice-response.dto.ts`
    - `InvoiceResponseDto`: `id`, `tenantId`, `periodStart`, `periodEnd`, `policiesCount`, `totalPremium`, `platformFee`, `subscriptionFee`, `amountDue`, `isProRata`, `daysActive`, `pdfUrl`, `status`, `createdAt`

### Backend — Service

- [ ] **Task 5: Създай `BillingService`** (AC: #1–#6)
  - [ ] Файл: `branivo-api/src/modules/billing/billing.service.ts`
  - [ ] Инжектирай: `BillingRepository`, `CommissionsService` (за policy data per tenant), `Queue` (billing BullMQ queue), `ConfigService`
  - [ ] Методи:
    - `scheduleBillingRun(): Promise<void>` — добавя BullMQ job за всички активни тенанти; извиква се от BullMQ repeatable job processor
    - `generateInvoiceForTenant(tenantId: string, periodStart: Date, periodEnd: Date): Promise<Invoice>` — core business logic:
      1. Idempotency check: `billingRepo.findByTenantAndPeriod(tenantId, periodStart)` → ако съществува → return existing
      2. Намери тенанта: `tenants WHERE id = ? AND status = 'active'`
      3. Изчисли pro-rata: ако `tenant.activated_at >= periodStart` → `isProRata = true`, `daysActive = daysFrom(tenant.activated_at, periodEnd)`, `subscriptionFee = round2(tenant.monthly_fee * daysActive / daysInMonth(periodStart))`
      4. Вземи policies за периода: `COUNT(*) + SUM(premium_amount) + SUM(commission_amount)` от `policies WHERE tenant_id = ? AND status = 'active' AND created_at BETWEEN periodStart AND periodEnd`
      5. Изчисли `amountDue = platformFee + subscriptionFee`
      6. INSERT в `invoices`
      7. Queue PDF generation job
    - `runManualBilling(tenantId?: string): Promise<void>` — за `POST /admin/billing/run`
    - `notifySuperAdminOnFailure(tenantId: string, error: Error): Promise<void>` — изпраща alert email
  - [ ] **Pro-rata helper**: `round2(n: number): number => Math.round(n * 100) / 100` — следва floating-point pattern от Story 5.2
  - [ ] **Period calculation**: При стартиране на job на 1-во число, `periodStart = first day of previous month`, `periodEnd = last day of previous month`
  - [ ] `currency`: винаги `'BGN'`

### Backend — BullMQ Processor

- [ ] **Task 6: Създай `InvoiceGenerationProcessor`** (AC: #1, #4)
  - [ ] Файл: `branivo-api/src/modules/billing/processors/invoice-generation.processor.ts`
  - [ ] `@Processor('billing')` decorator
  - [ ] `@Process('generate-invoice')` handler:
    - Получава `{ tenantId, periodStart, periodEnd }` от job data
    - Извиква `billingService.generateInvoiceForTenant()`
    - При грешка: `billingService.notifySuperAdminOnFailure()` в `onFailed` hook
  - [ ] `@Process('run-all-tenants')` handler:
    - Зарежда всички активни тенанти
    - За всеки: добавя отделен `generate-invoice` job в `billing` queue
  - [ ] BullMQ job options: `{ attempts: 3, backoff: { type: 'exponential', delay: 5000 } }` (retry 3x exponential backoff — следва архитектурния constraint)

### Backend — BullMQ Repeatable Job Registration

- [ ] **Task 7: Регистрирай repeatable job в `BillingModule`** (AC: #1)
  - [ ] Файл: `branivo-api/src/modules/billing/billing.module.ts`
  - [ ] `implements OnApplicationBootstrap`
  - [ ] В `onApplicationBootstrap()`:
    ```typescript
    await this.billingQueue.add(
      'run-all-tenants',
      {},
      {
        repeat: { pattern: '0 6 1 * *', tz: 'Europe/Sofia' },
        jobId: 'monthly-billing-run', // idempotent job ID — не се дублира
      }
    );
    ```
  - [ ] **Важно**: `jobId: 'monthly-billing-run'` осигурява идемпотентност при рестарт на сървъра — BullMQ не добавя дублиращ repeatable job ако `jobId` вече съществува
  - [ ] `BullModule.registerQueue({ name: 'billing' })` в imports
  - [ ] `InjectQueue('billing')` в constructor

### Backend — Controller

- [ ] **Task 8: Създай `BillingController`** (AC: #5)
  - [ ] Файл: `branivo-api/src/modules/billing/billing.controller.ts`
  - [ ] Само `super_admin` role — платформено ниво, без TenantContext
  - [ ] Endpoint: `POST /api/v1/admin/billing/run`
    - `@UseGuards(JwtAuthGuard, RolesGuard)`
    - `@Roles('super_admin')` на метода
    - `@Body() dto: ManualBillingRunDto`
    - Извиква `billingService.runManualBilling(dto.tenantId)`
    - Response: `{ message: 'Billing run initiated' }`
  - [ ] **Критично**: Този endpoint е **platform-level** — НЕ използва `TenantContext.getTenantId()` (за разлика от broker endpoints)

### Backend — Module

- [ ] **Task 9: Конфигурирай `BillingModule`** (AC: #1)
  - [ ] Файл: `branivo-api/src/modules/billing/billing.module.ts`
  - [ ] Imports: `TypeOrmModule.forFeature([Invoice])`, `BullModule.registerQueue({ name: 'billing' })`, `CommissionsModule` (за policy data)
  - [ ] Providers: `BillingService`, `BillingRepository`, `InvoiceGenerationProcessor`
  - [ ] Controllers: `BillingController`
  - [ ] Регистрирай `BillingModule` в `AppModule`

### Backend — Seed данни

- [ ] **Task 10: Добави seed данни за billing** (AC: #2)
  - [ ] Файл: `branivo-api/src/infrastructure/database/seed.service.ts`
  - [ ] Нов метод `seedDemoInvoices()`:
    - Създай 1–2 demo invoice records за demo тенанта за предишни месеци
    - `ON CONFLICT DO NOTHING` — idempotent
    - Status 'paid' за минали фактури
  - [ ] Извикай `seedDemoInvoices()` от `onApplicationBootstrap()`

### Frontend (Next.js) — Admin Billing страница

- [ ] **Task 11: Създай Admin Billing страница** (AC: #4, #5)
  - [ ] Файл: `branivo-web/src/app/[locale]/(admin)/billing/page.tsx`
  - [ ] `'use client'` компонент с TanStack Query
  - [ ] Структура:
    - "Стартирай billing" бутон → `POST /api/v1/admin/billing/run` без tenantId (за всички)
    - Tenant ID input field → manual run за конкретен тенант
    - Списък с последни фактури (mock или от реален API ако имплементиран)
    - Loading/success/error state management
  - [ ] Explicit TypeScript типове навсякъде — без `any`
  - [ ] **Важно**: Проверявай дали `(admin)/` layout вече съществува — ако не, следвай `(broker)/layout.tsx` pattern

### Backend — API Route Proxy (Next.js)

- [ ] **Task 12: Добави Next.js API route прокси за billing** (AC: #5)
  - [ ] Файл: `branivo-web/src/app/api/v1/admin/billing/run/route.ts` (POST)
  - [ ] Прокси към `branivo-api` с Bearer token от cookie
  - [ ] Следвай точно съществуващия proxy pattern от Story 5.1/5.2:
    ```typescript
    export async function POST(request: NextRequest): Promise<Response> {
      const token = cookies().get('access_token')?.value;
      if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      const body = await request.json() as unknown;
      const apiUrl = `${process.env.API_URL}/api/v1/admin/billing/run`;
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        const json = await res.json() as unknown;
        return NextResponse.json(json, { status: res.status });
      } catch {
        return NextResponse.json({ error: 'Gateway error' }, { status: 502 });
      }
    }
    ```

### Тестове — Backend

- [ ] **Task 13: Unit тест за `BillingService`** (AC: #1–#5)
  - [ ] Файл: `branivo-api/src/modules/billing/billing.service.spec.ts`
  - [ ] Тества:
    - `generateInvoiceForTenant` — изчислява summary за нормален тенант (без pro-rata)
    - `generateInvoiceForTenant` — pro-rata calculation при `activated_at` в средата на месеца
    - `generateInvoiceForTenant` — idempotency: ако invoice вече съществува → не INSERT-ва нова
    - `runManualBilling` — с tenantId → само за 1 тенант
    - `runManualBilling` — без tenantId → queue job за всички активни тенанти
    - `notifySuperAdminOnFailure` — извиква email notification

- [ ] **Task 14: Integration тест за `BillingController`** (AC: #5)
  - [ ] Файл: `branivo-api/src/modules/billing/billing.controller.spec.ts`
  - [ ] Тества:
    - `POST /api/v1/admin/billing/run` → 201 за super_admin
    - `POST /api/v1/admin/billing/run` с body `{ tenantId: 'uuid' }` → 201
    - `POST /api/v1/admin/billing/run` → 403 за broker_admin (wrong role)
    - No TenantContext used (platform-level)

### Тестове — Frontend

- [ ] **Task 15: Component тест за Admin Billing страница** (AC: #5)
  - [ ] Файл: `branivo-web/src/__tests__/admin/billing-page.test.tsx`
  - [ ] Тества: render на страницата, "Стартирай billing" бутон, loading state, success feedback

## Dev Notes

### Нов `billing` модул — следвай структурата от архитектурата

Архитектурата дефинира `billing/` като **отделен NestJS модул**:
```
branivo-api/src/modules/billing/
├── billing.module.ts
├── billing.controller.ts     # FR35: manual trigger; super_admin only
├── billing.service.ts        # cron 1st/month 06:00 EET; alert on failure < 15мин
├── billing.repository.ts
├── dto/
│   ├── manual-billing-run.dto.ts
│   └── invoice-response.dto.ts
├── entities/
│   └── invoice.entity.ts
└── processors/
    └── invoice-generation.processor.ts
```

Billing е **платформен** модул — работи над всички тенанти, **без** TenantContext scope (за разлика от `commissions/`).

### `tenants` таблица — dependency check

**Критично преди имплементация**: Провери дали `tenants` entity (`branivo-api/src/modules/tenants/entities/tenant.entity.ts`) има:
- `monthlyFee` (или `subscriptionMonthlyFee`) — DECIMAL поле за месечна такса
- `activatedAt` — TIMESTAMPTZ за pro-rata изчисление

Ако **не съществуват** → добави ги в нова миграция **преди** `1710000020000-CreateInvoices.ts`:
```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS monthly_fee DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
```
И обнови Tenant entity + seed.service.ts с demo стойности.

### BullMQ Repeatable Job — idempotentност при server restart

**Ключов проблем**: При всеки рестарт на сървъра `onApplicationBootstrap()` се извиква. Ако не се осигури idempotентност → ще се натрупат дублиращи repeatable jobs.

**Решение** — използвай `jobId`:
```typescript
await this.billingQueue.add('run-all-tenants', {}, {
  repeat: { pattern: '0 6 1 * *', tz: 'Europe/Sofia' },
  jobId: 'monthly-billing-run', // BullMQ не дублира ако jobId вече съществува
});
```

BullMQ пренаписва repeatable job ако `jobId` съвпада → safe на рестарт.

### Pro-rata изчисление — точна логика

```typescript
function calculateProRata(
  monthlyFee: number,
  tenantActivatedAt: Date,
  periodStart: Date, // first day of invoiced month
  periodEnd: Date,   // last day of invoiced month
): { subscriptionFee: number; daysActive: number; isProRata: boolean } {
  const activationDate = new Date(tenantActivatedAt);

  // Pro-rata само ако тенантът е активиран СЛЕД началото на периода
  if (activationDate <= periodStart) {
    return { subscriptionFee: monthlyFee, daysActive: null, isProRata: false };
  }

  const daysInMonth = getDaysInMonth(periodStart); // е.г. 28/29/30/31
  // дни от активация до края на месеца (включително)
  const daysActive = Math.ceil(
    (periodEnd.getTime() - activationDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;
  const subscriptionFee = round2(monthlyFee * daysActive / daysInMonth);

  return { subscriptionFee, daysActive, isProRata: true };
}
```

**Важно**: `round2` helper — `Math.round(n * 100) / 100` — същия pattern от Story 5.2.

### Period calculation при job execution

Job се изпълнява на **1-во число на текущия месец** → изчислява фактурата за **предишния месец**:

```typescript
function getPreviousMonthPeriod(now: Date): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
  return { periodStart, periodEnd };
}
```

### Super Admin alert — timing constraint (< 15 min)

NFR11 изисква alert в < 15 мин. BullMQ retry е с exponential backoff (5s → 25s → 125s) — максимум ~2.5 мин за 3 опита. При окончателен fail → `onFailed` processor hook извиква `billingService.notifySuperAdminOnFailure()` → email чрез `notifications/channels/email.channel.ts`.

Следвай email pattern от Story 4.4 (Policy Document Delivery):
```typescript
// branivo-api/src/modules/notifications/channels/email.channel.ts
await this.emailChannel.send({
  to: superAdminEmail,
  subject: `⚠️ Billing job failed for tenant ${tenantId}`,
  html: `<p>Invoice generation failed for tenant ${tenantId}.</p><p>Error: ${error.message}</p>`,
});
```

Провери как `email.channel.ts` е инжектиран/извикан от Story 4.4 за точния pattern.

### PDF генерация — подход

Invoice PDF може да се генерира по 2 начина:
1. **В BullMQ job** след успешно CREATE на invoice — генерирай PDF buffer с `pdfmake` или `@react-pdf/renderer`, upload към S3/tmp storage, запиши `pdf_url` в `invoices` таблицата, прикачи към email
2. **Inline при email изпращане** — генерирай PDF синхронно в `generateInvoiceForTenant()` преди изпращане на email

**Препоръка за Story 5.3**: Използвай **опция 2** (inline, синхронно) — по-прост за имплементация. PDF generation вече е налична в проекта от Story 4.4 (Policy Document Delivery). Провери `branivo-api/src/modules/policies/services/policy-pdf.service.ts` (или аналог) за reuse pattern.

Ако PDF library вече е инсталирана (Story 4.4) → reuse я. Ако не → добави `pdfmake` или `html-pdf` в package.json.

### Idempotency — manual re-run без дублиране (AC5)

```typescript
async generateInvoiceForTenant(tenantId: string, periodStart: Date, periodEnd: Date) {
  // ПЪРВО: idempotency check
  const existing = await this.billingRepo.findByTenantAndPeriod(tenantId, periodStart);
  if (existing) {
    this.logger.log(`Invoice already exists for tenant ${tenantId} period ${periodStart} — skipping`);
    return existing;
  }
  // ... генерирай нова фактура ...
}
```

DB UNIQUE constraint (`tenant_id`, `period_start`) е втора линия на защита при race condition.

### Миграционен timestamp

```
1710000019000-CreatePendingCommissionEvents.ts  ← Story 5.2 (съществува)
1710000020000-CreateInvoices.ts                 ← Story 5.3 (нова)
```

Ако `tenants` таблицата се нуждае от нови колони (`monthly_fee`, `activated_at`) → алтернативно:
```
1710000020000-AddTenantBillingFields.ts   ← ALTER TABLE tenants ADD COLUMN ...
1710000021000-CreateInvoices.ts           ← CREATE TABLE invoices ...
```

### Email channel pattern — референция

Провери Story 4.4 (Policy Document Delivery) за точния email pattern. Очаква се нещо подобно:
```typescript
// Email с PDF attachment
await this.emailChannel.send({
  to: brokerEmail,
  subject: `Фактура за ${periodLabel} — Branivo`,
  html: invoiceHtmlTemplate,
  attachments: [{ filename: `invoice-${periodLabel}.pdf`, content: pdfBuffer }],
});
```

### BullMQ 'billing' queue — регистрация в AppModule

BullMQ queue-ите се регистрират в `AppModule` или в отделните feature модули. Провери как са регистрирани `pdf-generation`, `notifications`, `logistics` queues (вероятно в `app.module.ts`) и следвай същия pattern за `billing` queue.

### Файлова структура

```
branivo-api/src/modules/billing/
├── billing.module.ts                    (new)
├── billing.controller.ts               (new — POST /admin/billing/run)
├── billing.service.ts                  (new — core logic, pro-rata, alert)
├── billing.repository.ts               (new — Invoice DB operations)
├── dto/
│   ├── manual-billing-run.dto.ts       (new)
│   └── invoice-response.dto.ts         (new)
├── entities/
│   └── invoice.entity.ts              (new)
└── processors/
    └── invoice-generation.processor.ts (new — BullMQ processor)

branivo-api/src/infrastructure/database/migrations/
└── 1710000020000-CreateInvoices.ts     (new — + optional tenants ALTER TABLE)

branivo-api/src/infrastructure/database/seed.service.ts  (modified — seedDemoInvoices)
branivo-api/src/app.module.ts                             (modified — register BillingModule)

branivo-web/src/app/[locale]/(admin)/billing/page.tsx     (new — Admin billing trigger)
branivo-web/src/app/api/v1/admin/billing/run/route.ts     (new — POST proxy)
branivo-web/src/__tests__/admin/billing-page.test.tsx     (new)
```

### API Pattern Reference

```typescript
// ✅ ПРАВИЛНО — Super Admin endpoint БЕЗ TenantContext
@Controller('admin/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  @Post('run')
  @Roles('super_admin')
  async runBilling(@Body() dto: ManualBillingRunDto): Promise<{ message: string }> {
    await this.billingService.runManualBilling(dto.tenantId);
    return { message: 'Billing run initiated' };
  }
}

// ❌ ЗАБРАНЕНО за platform-level endpoint
const tenantId = this.tenantContext.getTenantId(); // НЕ — billing е platform-wide
```

### TransformInterceptor

Всички API responses са в `{ data, meta: { timestamp } }` формат автоматично. Връщай само `{ message }` или `{ data }` от controller методите.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#FR Domain → Component Mapping] — `billing/` модул; `(admin)/billing/` frontend route
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Directory Structure] — billing.module.ts, billing.service.ts, billing.controller.ts, billing.repository.ts
- [Source: _bmad-output/planning-artifacts/architecture.md#API Boundaries] — `POST /api/v1/admin/billing/run` (super_admin role)
- [Source: _bmad-output/planning-artifacts/architecture.md#BullMQ Queue Architecture] — 3 queues; billing добавя 4-та за scheduled invoicing
- [Source: _bmad-output/planning-artifacts/architecture.md#Explicit Architectural Constraints] — BullMQ retry 3x exponential backoff; DLQ → Super Admin alert
- [Source: _bmad-output/planning-artifacts/architecture.md#Non-Functional Requirements] — NFR11: alert < 15 мин при billing failure
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3] — Acceptance criteria, pro-rata formula, cron pattern
- [Source: _bmad-output/implementation-artifacts/5-2-broker-commission-dashboard.md] — CommissionsRepository pattern (no BaseRepository extend), round2 helper, migration timestamp sequence, TenantContext vs platform-level distinction
- [Source: _bmad-output/implementation-artifacts/5-1-commission-matrix-configuration.md] — CommissionsService pattern, module structure
- [Source: branivo-api/src/modules/commissions/commissions.repository.ts] — repository pattern без BaseRepository
- [Source: branivo-api/src/modules/commissions/commissions.service.ts] — injectable service pattern
- [Source: branivo-api/src/infrastructure/database/seed.service.ts] — seedXxx() pattern, ON CONFLICT DO NOTHING
- [Source: branivo-web/src/app/api/v1/commissions/route.ts] — Next.js proxy route pattern (GET)
- [Source: branivo-api/src/modules/payments/stripe-webhook.service.ts] — BullMQ job добавяне pattern
- [Source: branivo-api/src/modules/notifications/channels/email.channel.ts] — email delivery за Super Admin alerts и broker notifications

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- AC6 (email с PDF фактура) имплементиран: `sendInvoiceEmail` в EmailService генерира PDF с pdfkit inline и го изпраща като attachment към broker_admin на тенанта
- Репeatble cron job регистриран с `jobId: 'monthly-billing-run'` за idempotentност при рестарт
- Pro-rata логика следва точната формула от story dev notes
- Super Admin alert само при финален failed attempt (не при всеки retry)

### File List

- branivo-api/src/infrastructure/database/migrations/1710000020000-AddTenantBillingFields.ts
- branivo-api/src/infrastructure/database/migrations/1710000021000-CreateInvoices.ts
- branivo-api/src/infrastructure/database/seed.service.ts
- branivo-api/src/infrastructure/email/email.service.ts
- branivo-api/src/infrastructure/queues/queue.module.ts
- branivo-api/src/modules/billing/billing.controller.spec.ts
- branivo-api/src/modules/billing/billing.controller.ts
- branivo-api/src/modules/billing/billing.module.ts
- branivo-api/src/modules/billing/billing.repository.ts
- branivo-api/src/modules/billing/billing.service.spec.ts
- branivo-api/src/modules/billing/billing.service.ts
- branivo-api/src/modules/billing/dto/invoice-response.dto.ts
- branivo-api/src/modules/billing/dto/manual-billing-run.dto.ts
- branivo-api/src/modules/billing/entities/invoice.entity.ts
- branivo-api/src/modules/billing/processors/invoice-generation.processor.ts
- branivo-api/src/modules/tenants/entities/tenant.entity.ts
- branivo-web/src/__tests__/admin/billing-page.test.tsx
- branivo-web/src/app/[locale]/(admin)/billing-runs/page.tsx
- branivo-web/src/app/api/v1/admin/billing/run/route.ts
