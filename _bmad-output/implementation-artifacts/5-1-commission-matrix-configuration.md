# Story 5.1: Commission Matrix Configuration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Super Admin,
I want to configure commission rates per insurer and product type,
so that platform fees are automatically calculated correctly without code deployments.

## Acceptance Criteria

1. **AC1 — Конфигуриране на ставка в матрицата:**
   **Given** Super Admin отваря Commission Matrix страницата,
   **When** задава ставка за insurer × product_type комбинация,
   **Then** промяната влиза в сила незабавно за всички нови полици (commission_matrix таблицата се обновява)

2. **AC2 — Audit log при промяна:**
   **Given** commission matrix е обновена,
   **When** промяната е записана,
   **Then** се логва в `audit_log` с `tenant_id = SYSTEM_TENANT_ID`, `user_id`, `insurer_id`, `product_type`, `old_rate`, `new_rate` — NFR40

3. **AC3 — Default fallback при липса на конфигурация:**
   **Given** нов застраховател е добавен,
   **When** няма конфигурирана ставка за него,
   **Then** системата използва `PLATFORM_FEE_PCT` env var като default (0.05 = 5%) до конфигуриране на специфична ставка

4. **AC4 — Commission snapshot при policy activation:**
   **Given** commission matrix съществува,
   **When** полицата се активира (Story 4.3 webhook — `payment_intent.succeeded`),
   **Then** `commission_pct` в `policies` таблицата е взет от commission_matrix (не от env var); snapshot е immutable и не се обновява при бъдещи промени в матрицата

5. **AC5 — Application fee при Payment Intent:**
   **Given** клиент пристъпва към плащане,
   **When** се създава Stripe Payment Intent (`POST /api/v1/payments/create-intent`),
   **Then** `application_fee_amount` се изчислява от commission_matrix (insurer × product_type); при липса на специфична ставка се използва default PLATFORM_FEE_PCT

6. **AC6 — Super Admin API за матрицата:**
   **Given** Super Admin е автентикиран,
   **When** извиква `GET /api/v1/admin/commissions` и `PUT /api/v1/admin/commissions/:insurerId/:productType`,
   **Then** може да чете и записва ставките; endpoint изисква `super_admin` роля

7. **AC7 — Seed данни за dev среда:**
   **Given** приложението стартира в non-production среда,
   **When** seed service се изпълни,
   **Then** commission_matrix е попълнена с примерни ставки за demo застрахователите (3–5 реда)

## Tasks / Subtasks

### Backend — DB Migration

- [x] **Task 1: Migration — Създай `commission_matrix` таблица** (AC: #1, #2, #4, #5)
  - [x] Файл: `branivo-api/src/infrastructure/database/migrations/1710000018000-CreateCommissionMatrix.ts`
  - [x] SQL:
    ```sql
    CREATE TABLE IF NOT EXISTS commission_matrix (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      insurer_id   UUID NOT NULL REFERENCES insurers(id),
      product_type VARCHAR(20) NOT NULL CHECK (product_type IN ('GO', 'KASKO', 'PROPERTY')),
      rate_pct     DECIMAL(5, 4) NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 1),
      created_by   UUID NULL,   -- user_id на Super Admin
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (insurer_id, product_type)
    );
    CREATE INDEX IF NOT EXISTS idx_commission_matrix_insurer ON commission_matrix(insurer_id);
    ```
  - [x] **Важно**: Без `tenant_id` и без RLS — таблицата е platform-level (Super Admin scope)
  - [x] Без `deleted_at` — ставките се UPDATE-ват на място (не soft delete)

### Backend — Entity & Enum

- [x] **Task 2: Създай `CommissionMatrix` entity** (AC: #1, #4)
  - [x] Файл: `branivo-api/src/modules/commissions/entities/commission-matrix.entity.ts`
  - [x] Полета: `id`, `insurerId` (FK), `productType` (enum), `ratePct` (decimal), `createdBy` (nullable UUID), `createdAt`, `updatedAt`
  - [x] **Без** `tenant_id`, `deleted_at` — платформена таблица
  - [x] `{ name: 'snake_case' }` задължително за всеки `@Column`

- [x] **Task 3: Създай `ProductType` enum**
  - [x] Файл: `branivo-api/src/modules/commissions/enums/product-type.enum.ts`
  - [x] Стойности: `GO = 'GO'`, `KASKO = 'KASKO'`, `PROPERTY = 'PROPERTY'`

### Backend — Repository

- [x] **Task 4: Създай `CommissionsRepository`** (AC: #1, #3, #4, #5)
  - [x] Файл: `branivo-api/src/modules/commissions/commissions.repository.ts`
  - [x] **Не extends BaseRepository** — платформена таблица без tenant scope
  - [x] Методи:
    - `findByInsurerAndProduct(insurerId: string, productType: string): Promise<CommissionMatrix | null>`
    - `findAll(): Promise<CommissionMatrix[]>` — за Super Admin list view
    - `upsert(data: { insurerId: string; productType: string; ratePct: number; createdBy: string | null }): Promise<CommissionMatrix>` — INSERT OR UPDATE
  - [x] Inject `@InjectRepository(CommissionMatrix)` в constructor

### Backend — DTOs

- [x] **Task 5: Създай DTO файлове**
  - [x] `branivo-api/src/modules/commissions/dto/upsert-commission-rate.dto.ts`
  - [x] `branivo-api/src/modules/commissions/dto/commission-matrix-response.dto.ts`

### Backend — Service

- [x] **Task 6: Създай `CommissionsService`** (AC: #1, #2, #3, #4, #5)
  - [x] Файл: `branivo-api/src/modules/commissions/commissions.service.ts`
  - [x] `CommissionsService` е **injectable и exportable** — ще се използва от `PaymentsModule`
  - [x] Методи: `getRate`, `listMatrix`, `upsertRate`
  - [x] **Audit log** в `upsertRate`: INSERT в `audit_log` с action `'commission_matrix.updated'`
  - [x] Audit log се пише директно чрез DataSource raw query

### Backend — Controller

- [x] **Task 7: Създай `CommissionsController`** (AC: #6)
  - [x] Файл: `branivo-api/src/modules/commissions/commissions.controller.ts`
  - [x] Endpoints: `GET /api/v1/admin/commissions` и `PUT /api/v1/admin/commissions/:insurerId/:productType`
  - [x] `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('super_admin')` на controller ниво
  - [x] **Не** `TenantContext.getTenantId()` — Super Admin endpoint е tenant-agnostic

### Backend — Module

- [x] **Task 8: Създай `CommissionsModule`** (AC: #5 — integration с PaymentsModule)
  - [x] Файл: `branivo-api/src/modules/commissions/commissions.module.ts`
  - [x] `TypeOrmModule.forFeature([CommissionMatrix])`
  - [x] **Exports: `[CommissionsService]`** — за импортиране в PaymentsModule
  - [x] Регистриран в `app.module.ts`

### Backend — Integration: PaymentsService (TODO Resolution)

- [x] **Task 9: Разреши TODO в `PaymentsService`** (AC: #5)
  - [x] Файл: `branivo-api/src/modules/payments/payments.service.ts`
  - [x] Заменен TODO блок — `commissionsService.getRate()` се извиква при createIntent
  - [x] `CommissionsService` инжектиран в `PaymentsService` constructor
  - [x] `CommissionsModule` добавен в imports на `PaymentsModule`

### Backend — Seed данни

- [x] **Task 10: Добави commission seed** (AC: #7)
  - [x] Файл: `branivo-api/src/infrastructure/database/seed.service.ts`
  - [x] Метод `seedCommissionMatrix()` добавен и извикан от `onApplicationBootstrap()`
  - [x] Seed 4 реда за demo застрахователите с `ON CONFLICT ... DO NOTHING`

### Frontend (Next.js) — Admin Commission Matrix страница

- [x] **Task 11: Създай Commission Matrix страница** (AC: #1, #6)
  - [x] Файл: `branivo-web/src/app/[locale]/(admin)/commissions/page.tsx`
  - [x] `'use client'` компонент с TanStack Query
  - [x] Таблица с inline edit, skeleton loading, error handling

- [x] **Task 12: Добави Next.js API route прокси** (AC: #6)
  - [x] Файл: `branivo-web/src/app/api/v1/admin/commissions/route.ts` (GET)
  - [x] Файл: `branivo-web/src/app/api/v1/admin/commissions/[insurerId]/[productType]/route.ts` (PUT)
  - [x] Прокси към `branivo-api` с Bearer token от cookie

### Тестове — Backend

- [x] **Task 13: Unit тест за `CommissionsService`** (AC: #1, #2, #3)
  - [x] Файл: `branivo-api/src/modules/commissions/commissions.service.spec.ts`
  - [x] Тества: `getRate` (happy path + fallback), `upsertRate` (DB + audit_log, old/new rate)

- [x] **Task 14: Integration тест за `CommissionsController`** (AC: #6)
  - [x] Файл: `branivo-api/src/modules/commissions/commissions.controller.spec.ts`
  - [x] Тества: GET 200, PUT 200, 403 за broker_admin, 400 при ratePct > 1

- [x] **Task 15: Unit тест за `PaymentsService` — commission_matrix integration** (AC: #5)
  - [x] Файл: `branivo-api/src/modules/payments/payments.service.spec.ts` (разширен)
  - [x] Тества: `commissionsService.getRate` се извиква, applicationFeeAmount е коректен, default GO product_type

## Dev Notes

### Архитектурни изисквания

- **Commission snapshot е IMMUTABLE**: `commissionPct` в `policies` таблицата се записва ВЕДНЪЖ при policy activation и не се променя при бъдещи updates на commission_matrix. Вече е имплементирано в `stripe-webhook.service.ts` (ред 122); Story 5.1 само гарантира, че стойността идва от commission_matrix вместо от env var.

- **commission_matrix е платформена таблица (без tenant_id)**: Управлява се от Super Admin и важи за всички тенанти. Не подлежи на RLS. `CommissionsRepository` не extends `BaseRepository` и не извиква `setTenantSession()`.

- **Audit log**: `audit_log` таблицата е IMMUTABLE (без UPDATE/DELETE). За Super Admin операции `tenant_id` = `'00000000-0000-0000-0000-000000000000'` (system UUID) или специален SYSTEM_TENANT_ID константа.

- **NestJS EventEmitter**: Не е необходим за Story 5.1 — commission_matrix update не тригерира cross-module events.

- **TransformInterceptor**: Всички API responses трябва да са в `{ data, meta: { timestamp } }` формат — interceptor-ът го прави автоматично.

### Съществуващ код и критични интеграционни точки

- **`branivo-api/src/modules/payments/payments.service.ts` редове 56-61**: Съдържа `TODO (Story 5.1)` — точно тук се инжектира `CommissionsService.getRate()`
- **`branivo-api/src/modules/payments/stripe-webhook.service.ts` редове 92-94**: `commissionPct` snapshot вече се записва от `payment.platformFeePct` — след Story 5.1 тази стойност ще е от commission_matrix (записана в payment record)
- **`branivo-api/src/modules/billing/billing.module.ts`**: Billing модулът е empty skeleton — Story 5.1 НЕ го попълва (това е Story 5.3)
- **`branivo-api/src/modules/admin/admin.controller.ts`**: Empty controller — Story 5.1 добавя commissions endpoints

### Файлова структура

```
branivo-api/src/modules/commissions/
├── commissions.module.ts
├── commissions.controller.ts        # GET + PUT /admin/commissions
├── commissions.service.ts           # getRate, listMatrix, upsertRate
├── commissions.repository.ts        # НЕ extends BaseRepository
├── dto/
│   ├── upsert-commission-rate.dto.ts
│   └── commission-matrix-response.dto.ts
├── enums/
│   └── product-type.enum.ts
└── entities/
    └── commission-matrix.entity.ts

branivo-api/src/infrastructure/database/migrations/
└── 1710000018000-CreateCommissionMatrix.ts

branivo-web/src/app/[locale]/(admin)/commissions/
└── page.tsx

branivo-web/src/app/api/v1/admin/commissions/
├── route.ts
└── [insurerId]/[productType]/route.ts
```

### API Pattern Reference

```typescript
// ✅ ПРАВИЛНО — Super Admin endpoint без TenantContext
@Controller('admin/commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class CommissionsController {
  @Get()
  async listMatrix() {
    const data = await this.commissionsService.listMatrix();
    return { data }; // TransformInterceptor добавя meta.timestamp
  }

  @Put(':insurerId/:productType')
  async upsertRate(
    @Param('insurerId') insurerId: string,
    @Param('productType') productType: string,
    @Body() dto: UpsertCommissionRateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.commissionsService.upsertRate(insurerId, { ...dto, productType }, user.sub);
    return { data };
  }
}

// ❌ ЗАБРАНЕНО — не използвай TenantContext в Super Admin commissions endpoints
const tenantId = this.tenantContext.getTenantId(); // ГРЕШНО за commission matrix
```

### Миграционен timestamp

Последната миграция е `1710000017000-AddStickerDelivery.ts`. Новата миграция трябва да е `1710000018000-CreateCommissionMatrix.ts`.

### Quote entity — productType поле

Провери дали `quotes` таблицата има `product_type` колона. Ако не — Story 5.1 трябва да я добави (или да използва `quote.metadata.productType` като fallback). Default е `'GO'` за ГО застраховка.

### Тестване на audit log

Audit log insert трябва да минава директно чрез `DataSource.query()` в `CommissionsService`:
```typescript
await this.dataSource.query(
  `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  [SYSTEM_TENANT_ID, userId, 'commission_matrix.updated', 'commission_matrix', entry.id,
   JSON.stringify({ insurer_id: insurerId, product_type, old_rate: oldRate, new_rate: dto.ratePct })]
);
```

### Frontend pattern (от съществуващ код)

Следвай шаблона на `branivo-web/src/app/[locale]/(admin)/tenants/page.tsx`:
- `useQuery` с `staleTime: 30_000` (или 60_000 за commission matrix — по-рядко се сменя)
- `useMutation` за PUT операции
- `void queryClient.invalidateQueries(...)` след успешна мутация
- Explicit TypeScript типове навсякъде (без `any`)
- Fetch към `/api/v1/admin/...` с `credentials: 'include'`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Explicit Architectural Constraints] — Commission snapshot immutability
- [Source: _bmad-output/planning-artifacts/architecture.md#Commission Matrix] — commission_matrix таблица дизайн
- [Source: _bmad-output/planning-artifacts/architecture.md#FR Domain → Component Mapping] — commissions/ модул структура
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1] — Acceptance criteria
- [Source: branivo-api/src/modules/payments/payments.service.ts:56-61] — TODO за commission_matrix integration
- [Source: branivo-api/src/modules/payments/stripe-webhook.service.ts:92-94] — Commission snapshot при policy activation
- [Source: branivo-api/src/modules/admin/admin.controller.ts] — Empty Admin controller (добавяш commissions тук)
- [Source: branivo-api/src/common/base.repository.ts] — BaseRepository (CommissionsRepository НЕ extends тази)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- TypeScript `isolatedModules` изисква `import type` за decorator-referenced types — поправено в `commissions.controller.ts`
- Mock queue bleeding между тестове — поправено чрез премахване на излишния `mockResolvedValueOnce(undefined)` в service spec

### Completion Notes List

- Имплементиран пълен `commissions` NestJS модул (entity, repository, service, controller, module)
- `CommissionsRepository` използва raw SQL upsert (`ON CONFLICT ... DO UPDATE`) за коректно платформено scope
- `CommissionsService.getRate()` инжектиран в `PaymentsService` — заменен TODO
- `ProductType` enum: GO, KASKO, PROPERTY
- Audit log записва `old_rate`, `new_rate` директно чрез `DataSource.query()` (SYSTEM_TENANT_ID)
- Seed данни за 4 demo застрахователя (allianz, generali, dsk, bulstrad) с различни GO ставки
- Next.js: commission matrix страница с inline edit, skeleton rows, Bulgarian error messages
- Next.js: API route прокси за GET и PUT endpoints
- Всички 399 теста минават; build минава без грешки

### File List

- `branivo-api/src/infrastructure/database/migrations/1710000018000-CreateCommissionMatrix.ts` (new)
- `branivo-api/src/modules/commissions/entities/commission-matrix.entity.ts` (new)
- `branivo-api/src/modules/commissions/enums/product-type.enum.ts` (new)
- `branivo-api/src/modules/commissions/commissions.repository.ts` (new)
- `branivo-api/src/modules/commissions/dto/upsert-commission-rate.dto.ts` (new)
- `branivo-api/src/modules/commissions/dto/commission-matrix-response.dto.ts` (new)
- `branivo-api/src/modules/commissions/commissions.service.ts` (new)
- `branivo-api/src/modules/commissions/commissions.controller.ts` (new)
- `branivo-api/src/modules/commissions/commissions.module.ts` (new)
- `branivo-api/src/modules/commissions/commissions.service.spec.ts` (new)
- `branivo-api/src/modules/commissions/commissions.controller.spec.ts` (new)
- `branivo-api/src/modules/payments/payments.service.ts` (modified — CommissionsService injection, TODO resolved)
- `branivo-api/src/modules/payments/payments.module.ts` (modified — CommissionsModule imported)
- `branivo-api/src/modules/payments/payments.service.spec.ts` (modified — commission test cases added)
- `branivo-api/src/infrastructure/database/seed.service.ts` (modified — seedCommissionMatrix added)
- `branivo-api/src/app.module.ts` (modified — CommissionsModule registered)
- `branivo-web/src/app/[locale]/(admin)/commissions/page.tsx` (new)
- `branivo-web/src/app/api/v1/admin/commissions/route.ts` (new)
- `branivo-web/src/app/api/v1/admin/commissions/[insurerId]/[productType]/route.ts` (new)
- `branivo-web/src/__tests__/admin/commissions.page.test.tsx` (new — code review fix H2)
- `branivo-api/src/modules/logistics/logistics.service.ts` (modified — code formatting only)
- `branivo-api/src/modules/payments/stripe-webhook.service.spec.ts` (modified — code formatting only)

## Change Log

- 2026-03-21: Story 5.1 имплементирана — Commission Matrix Configuration (claude-sonnet-4-6)
- 2026-03-21: Code review fixes — ParseEnumPipe/ParseUUIDPipe за URL params, try/catch за audit log, error handling в repository, Next.js proxy error handling, empty state UI, frontend component тест добавен (claude-sonnet-4-6)
