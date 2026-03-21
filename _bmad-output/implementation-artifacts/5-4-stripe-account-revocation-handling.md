# Story 5.4: Stripe Account Revocation Handling

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the Platform,
I want to automatically block new sales when a tenant's Stripe account is revoked,
So that compliance is maintained while existing policies remain accessible.

## Acceptance Criteria

1. **AC1 — Автоматично блокиране при webhook `account.updated` (charges_enabled: false):**
   **Given** Stripe изпраща `account.updated` webhook за connected account с `charges_enabled: false`,
   **When** webhook е обработен,
   **Then** tenant статусът се обновява до `stripe_revoked` и нови quote заявки за тенанта връщат HTTP 403

2. **AC2 — Блокиране на покупка при `stripe_revoked`:**
   **Given** tenant е в `stripe_revoked` статус,
   **When** краен клиент се опита да закупи полица (POST /payments/intent),
   **Then** заявката е блокирана с HTTP 403 и ясно съобщение: `"Broker account is suspended. New purchases are not available."`

3. **AC3 — Съществуващи полици остават достъпни (read-only):**
   **Given** tenant е в `stripe_revoked` статус,
   **When** съществуващ клиент преглежда своите полици,
   **Then** всички издадени полици са достъпни и GET ендпойнтите за полици работят нормално

4. **AC4 — Автоматично възстановяване при reinstatement:**
   **Given** Stripe account е възстановен (charges_enabled: true),
   **When** `account.updated` webhook е получен,
   **Then** tenant статусът се обновява до `active` и нови продажби се възобновяват автоматично

5. **AC5 — Audit log + email нотификация до брокера:**
   **Given** revocation или reinstatement event е обработен,
   **When** статусът се промени,
   **Then** събитието се записва в `audit_log` (IMMUTABLE — без UPDATE/DELETE) и брокерът получава имейл нотификация

## Tasks / Subtasks

### Backend — StripeWebhookService

- [x] **Task 1: Добави `account.updated` handler в `StripeWebhookService`** (AC: #1, #4, #5)
  - [x] Файл: `branivo-api/src/modules/payments/stripe-webhook.service.ts`
  - [x] В `handleEvent()` switch добави:
    ```typescript
    case 'account.updated':
      await this.handleAccountUpdated(event.id, event.data.object as Stripe.Account);
      break;
    ```
  - [x] Добави private method `handleAccountUpdated(stripeEventId: string, account: Stripe.Account)`:
    1. Намери tenant по `stripeAccountId`: `this.tenantsRepo.findByStripeAccountId(account.id)` → ако не намери → `logger.warn` и return
    2. Определи новия статус: `account.charges_enabled === false ? 'stripe_revoked' : 'active'`
    3. Провери текущия статус — ако вече е в целевия статус → idempotent return (без дублиране)
    4. Изпълни `this.tenantsRepo.updateStatus(tenant.id, newStatus)`
    5. Логни в `audit_log`:
       ```typescript
       await this.dataSource.query(
         `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
          VALUES ($1, NULL, $2, 'tenant', $3, $4, NOW())`,
         [
           tenant.id,
           account.charges_enabled ? 'stripe_account_reinstated' : 'stripe_account_revoked',
           tenant.id,
           JSON.stringify({ stripeEventId, chargesEnabled: account.charges_enabled }),
         ],
       );
       ```
    6. Изпрати имейл нотификация: `this.emailService.sendStripeRevocationEmail(...)` (виж Task 3)
  - [x] Инжектирай `DataSource` в constructor (вече е достъпен от TypeORM)
  - [x] Инжектирай `EmailService` (infrastructure) в constructor
  - [x] **КРИТИЧНО:** `account.updated` е Connect webhook → `event.data.object` е `Stripe.Account`; Stripe изпраща connected account events към платформения webhook endpoint само ако е конфигуриран да слуша Connect events в Stripe Dashboard

### Backend — EmailService (Infrastructure)

- [x] **Task 2: Добави `sendStripeRevocationEmail()` в Infrastructure EmailService** (AC: #5)
  - [x] Файл: `branivo-api/src/infrastructure/email/email.service.ts`
  - [x] Добави метод:
    ```typescript
    async sendStripeRevocationEmail(params: {
      to: string;
      tenantName: string;
      isRevoked: boolean;
      stripeAccountId: string;
    }): Promise<void>
    ```
  - [x] При revocation (`isRevoked: true`):
    - Subject: `⚠️ Вашият Stripe акаунт е спрян — нови продажби са блокирани`
    - Съдържание: Обяснение за спирането, инструкции за контакт със Stripe, изброени полици остават достъпни
  - [x] При reinstatement (`isRevoked: false`):
    - Subject: `✅ Вашият Stripe акаунт е възстановен — продажбите са възобновени`
    - Съдържание: Потвърждение за възстановяване
  - [x] Използвай `this.transporter` и `process.env.SMTP_FROM` (следвай съществуващия pattern)

### Backend — QuotesService блокиране

- [x] **Task 3: Блокирай quote заявки при `stripe_revoked`** (AC: #1)
  - [x] Файл: `branivo-api/src/modules/quotes/quotes.service.ts`
  - [x] В `createQuoteRequest()`, след `const tenantId = this.tenantContext.getTenantId()`, добави:
    ```typescript
    // AC1: Block quotes for stripe_revoked tenants
    const tenant = await this.tenantsRepo.findById(tenantId);
    if (tenant?.status === 'stripe_revoked') {
      throw new ForbiddenException('Broker account is suspended. New purchases are not available.');
    }
    ```
  - [x] Използвай директно `TenantsRepository.findById()` (без нов метод в QuotesRepository)
  - [x] Импортирай `ForbiddenException` от `@nestjs/common`

### Backend — PaymentsService блокиране

- [x] **Task 4: Блокирай payment intent при `stripe_revoked`** (AC: #2)
  - [x] Файл: `branivo-api/src/modules/payments/payments.service.ts`
  - [x] В `createIntent()`, след стъпка 4 (зареждане на tenant — ред ~68-70), добави:
    ```typescript
    // AC2: Block purchases for stripe_revoked tenants (FR36)
    if (tenant.status === 'stripe_revoked') {
      throw new ForbiddenException('Broker account is suspended. New purchases are not available.');
    }
    ```
  - [x] Импортирай `ForbiddenException` от `@nestjs/common`
  - [x] Вмъкни check-а СЛЕД `if (!tenant?.stripeAccountId)` guard (стъпка 4 в createIntent)

### Backend — QuotesRepository (ако е нужно)

- [x] **Task 5: Провери дали `findActiveTenant()` съществува в `QuotesRepository`** (AC: #1)
  - [x] `QuotesRepository` няма `findActiveTenant()` — директно инжектиран `TenantsRepository` в `QuotesService`
  - [x] Използвай: `const tenant = await this.tenantsRepo.findById(tenantId)`

### Backend — PaymentsModule (DI setup)

- [x] **Task 6: Обнови PaymentsModule за новите зависимости** (AC: #1, #5)
  - [x] `DataSource` е auto-injected от TypeORM — без промени нужни
  - [x] Добавен `EmailModule` в imports на `PaymentsModule`
  - [x] Добавен `TenantsModule` в imports на `QuotesModule`

### Тестове — Backend

- [x] **Task 7: Unit тест за `StripeWebhookService.handleAccountUpdated()`** (AC: #1, #4, #5)
  - [x] Файл: `branivo-api/src/modules/payments/stripe-webhook.service.spec.ts`
  - [x] Тества:
    - `account.updated` с `charges_enabled: false` → `updateStatus('stripe_revoked')` + audit_log INSERT + email ✓
    - `account.updated` с `charges_enabled: true` → `updateStatus('active')` + audit_log INSERT + email ✓
    - Idempotency: вече `stripe_revoked` + нов revocation event → без двойна update/email ✓
    - Tenant не намерен по `stripeAccountId` → warn log, без грешка ✓
    - Audit log INSERT извикан с правилните параметри ✓

- [x] **Task 8: Unit тест за QuotesService** (AC: #1)
  - [x] Файл: `branivo-api/src/modules/quotes/quotes.service.spec.ts`
  - [x] Тества:
    - `createQuoteRequest()` при `stripe_revoked` tenant → хвърля `ForbiddenException` ✓
    - `createQuoteRequest()` при `active` tenant → нормален flow (без промяна) ✓

- [x] **Task 9: Unit тест за PaymentsService** (AC: #2)
  - [x] Файл: `branivo-api/src/modules/payments/payments.service.spec.ts`
  - [x] Тества:
    - `createIntent()` при `stripe_revoked` tenant → хвърля `ForbiddenException` ✓
    - `createIntent()` при `active` tenant → нормален flow ✓

## Dev Notes

### Архитектурен overview — Stripe Account Revocation

Story 5.4 е **платформено** събитие — не е tenant-scoped. Webhook-ът идва от Stripe за конкретен connected account и платформата трябва да актуализира tenant статуса.

```
Stripe Dashboard
  → account.updated webhook (charges_enabled: false/true)
  → POST /api/v1/payments/webhook (raw body → sig verify)
  → BullMQ QUEUE_WEBHOOK_PROCESSING (jobId: event.id — idempotent)
  → WebhookProcessingProcessor.process()
  → StripeWebhookService.handleEvent() → handleAccountUpdated()
  → TenantsRepository.updateStatus('stripe_revoked' | 'active')
  → audit_log INSERT (IMMUTABLE)
  → EmailService.sendStripeRevocationEmail()
```

### `account.updated` — Stripe Connect webhook specifics

**КРИТИЧНО:** `account.updated` е **Connect webhook event** — изпраща се само ако:
1. Stripe Dashboard webhook endpoint е конфигуриран с **"Listen to events on Connected accounts"**
2. Или ако се използва Connect webhook endpoint отделно

Event структура:
```typescript
// event.type === 'account.updated'
// event.data.object е Stripe.Account (connected account)
const account = event.data.object as Stripe.Account;
// account.id → stripeAccountId на тенанта (acct_xxx)
// account.charges_enabled → false при revocation, true при reinstatement
```

Ако проектът използва само platform-level webhook endpoint → добави в Stripe Dashboard под webhook настройките: `account.updated` event type + enable "Connect events".

### Idempotency при webhook обработка

Webhook-ът се добавя в BullMQ с `jobId: event.id` (виж `payments.controller.ts:78`). Ако Stripe retry-не същото събитие → BullMQ го игнорира (duplicate `jobId`). Допълнително в `handleAccountUpdated()` трябва да се провери текущия статус преди update:

```typescript
if (tenant.status === newStatus) {
  this.logger.log(`Tenant ${tenant.id} already in status ${newStatus} — skipping`);
  return;
}
```

### `TenantsRepository` — налични методи (без нужда от нови)

```typescript
// Вече съществуват:
findByStripeAccountId(stripeAccountId: string): Promise<Tenant | null>  // намери tenant по Stripe account
updateStatus(id: string, status: string): Promise<void>                  // обнови статуса
findById(id: string): Promise<Tenant | null>                             // за QuotesService
```

Не добавяй нови методи в TenantsRepository — съществуващите са достатъчни.

### Tenant status values

Tenant.status е `VARCHAR(50)` без CHECK constraint (виж `tenant.entity.ts:21` и `CreateTenantsTable` migration). Може да съдържа:
- `invited` — поканен, не е завършил onboarding
- `active` — активен тенант
- `suspended` — суспендиран от Super Admin (ако е имплементирано)
- `stripe_revoked` — **нов статус** (Story 5.4); Stripe account е revoked

Няма нужда от нова DB миграция — statusът е свободен varchar.

### Audit log — raw SQL pattern (IMMUTABLE)

Следвай pattern от `admin-tenants.service.ts:368-375`:
```typescript
await this.dataSource.query(
  `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
   VALUES ($1, NULL, $2, 'tenant', $3, $4, NOW())`,
  [
    tenant.id,
    'stripe_account_revoked', // или 'stripe_account_reinstated'
    tenant.id,                // entity_id = tenant.id
    JSON.stringify({
      stripeEventId,
      stripeAccountId: account.id,
      chargesEnabled: account.charges_enabled,
    }),
  ],
);
```

**ЗАДЪЛЖИТЕЛНО:** audit_log е IMMUTABLE — никога no UPDATE или DELETE! Само INSERT.

Забележка за RLS: audit_log има RLS policy (`tenant_isolation_audit_log`) базирана на `app.current_tenant_id`. За platform-level inserts (без TenantContext) използвай `DataSource.query()` директно — TypeORM заобикаля RLS при raw query в `bypassRowLevelSecurity` контекст, ИЛИ добави `SET LOCAL app.current_tenant_id = $1` преди INSERT в транзакция. Виж как `admin-tenants.service.ts` прави го (ред 360-375).

### PaymentsService — точна позиция за блокиращия check (AC2)

```typescript
// В payments.service.ts, createIntent():
// ... ред ~68
const tenant = await this.tenantsRepo.findById(tenantId);
if (!tenant?.stripeAccountId) {
  throw new BadRequestException('Tenant Stripe account not configured');
}

// ← ДОБАВИ ТУК (след stripeAccountId check):
if (tenant.status === 'stripe_revoked') {
  throw new ForbiddenException(
    'Broker account is suspended. New purchases are not available.',
  );
}
// ... продължава с createPaymentIntent ...
```

### QuotesService — точна позиция за блокиращия check (AC1)

```typescript
// В quotes.service.ts, createQuoteRequest():
async createQuoteRequest(dto: CreateQuoteDto): Promise<QuoteResponseDto> {
  const tenantId = this.tenantContext.getTenantId();

  // ← ДОБАВИ ТУК (преди activeInsurers):
  const tenant = await this.tenantsRepo.findById(tenantId);
  if (tenant?.status === 'stripe_revoked') {
    throw new ForbiddenException(
      'Broker account is suspended. New purchases are not available.',
    );
  }

  const activeInsurers = await this.quotesRepository.findActiveInsurers();
  // ...
}
```

Инжектирай `TenantsRepository` в `QuotesService` ако не е вече. Добави в `quotes.module.ts` imports: `TenantsModule` (или `TypeOrmModule.forFeature([Tenant])`).

### AC3 — Съществуващи полици достъпни (read-only)

Не се изисква имплементация! GET endpoints за полици не извършват status check за `stripe_revoked`. Проверката е само при нови quote/purchase заявки. Ако съществуващи GET endpoint за полици вече работят → AC3 е автоматично изпълнен.

### Email broker нотификация — намиране на email адреса

За изпращане на имейл до брокера, трябва да намерим email адреса на `broker_admin` за тенанта:
- Провери дали `TenantsRepository` или `UsersRepository` има метод `findBrokerAdminByTenantId(tenantId)`
- Ако не → query: `SELECT email FROM users WHERE tenant_id = $1 AND role = 'broker_admin' LIMIT 1`
- Инжектирай `DataSource` в `StripeWebhookService` (или добави метод в UsersRepository)

### Файлова структура — промени

```
branivo-api/src/modules/payments/
├── stripe-webhook.service.ts      (modified — add handleAccountUpdated)
├── stripe-webhook.service.spec.ts (modified — add account.updated tests)
├── payments.service.ts            (modified — add stripe_revoked check)
├── payments.service.spec.ts       (modified — add stripe_revoked test)
└── payments.module.ts             (possibly modified — EmailModule import)

branivo-api/src/modules/quotes/
├── quotes.service.ts              (modified — add stripe_revoked ForbiddenException)
└── quotes.service.spec.ts         (modified — add stripe_revoked test)

branivo-api/src/infrastructure/email/
└── email.service.ts               (modified — add sendStripeRevocationEmail)
```

**Нови файлове: 0** — всички промени са в съществуващи файлове.

### TypeScript типизация — без `any`

```typescript
// ✅ ПРАВИЛНО
const account = event.data.object as Stripe.Account;
const newStatus: 'stripe_revoked' | 'active' = account.charges_enabled ? 'active' : 'stripe_revoked';

// ❌ ЗАБРАНЕНО
const account: any = event.data.object;
```

### References

- [Source: branivo-api/src/modules/payments/stripe-webhook.service.ts] — handleEvent() switch структура; инжектирани зависимости; TenantsRepository вече е инжектиран (ред 41)
- [Source: branivo-api/src/modules/payments/payments.controller.ts:78-79] — jobId idempotency pattern за webhook processing
- [Source: branivo-api/src/modules/payments/webhook-processing.processor.ts] — QUEUE_WEBHOOK_PROCESSING; handleEvent() call chain
- [Source: branivo-api/src/modules/tenants/tenants.repository.ts:172-176] — `findByStripeAccountId()` метод (вече съществува)
- [Source: branivo-api/src/modules/tenants/tenants.repository.ts:157-159] — `updateStatus()` метод (вече съществува)
- [Source: branivo-api/src/modules/tenants/entities/tenant.entity.ts:20-21] — status е VARCHAR(50), без CHECK constraint
- [Source: branivo-api/src/modules/payments/payments.service.ts:68-71] — стъпка 4 в createIntent() — добавяме stripe_revoked check след stripeAccountId guard
- [Source: branivo-api/src/modules/quotes/quotes.service.ts:58-60] — createQuoteRequest() начало — добавяме stripe_revoked check
- [Source: branivo-api/src/modules/admin/admin-tenants.service.ts:366-375] — raw SQL audit_log INSERT pattern
- [Source: branivo-api/src/infrastructure/database/migrations/1710000005000-CreateAuditLogTable.ts] — audit_log schema: tenant_id, user_id, action, entity_type, entity_id, metadata, created_at
- [Source: branivo-api/src/infrastructure/email/email.service.ts] — EmailService с nodemailer/SMTP; sendBillingFailureAlert() като pattern за нов метод
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4] — User story, Acceptance Criteria
- [Source: _bmad-output/planning-artifacts/epics.md#FR36] — FR36: блокиране при revocation; съществуващи полици достъпни
- [Source: _bmad-output/planning-artifacts/architecture.md#Stripe webhook] — raw body parsing; sig verify; Stripe webhook signature verification

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Имплементирани са всички 9 tasks. Не са нужни нови DB миграции (status е free VARCHAR(50)).
- `handleAccountUpdated()` използва `dataSource.transaction()` с `SET LOCAL app.current_tenant_id` за RLS bypass при audit_log INSERT — следвайки pattern от `admin-tenants.service.ts`.
- `TenantsRepository` методи `findByStripeAccountId()`, `updateStatus()`, `findById()` са вече налични — без нови методи.
- `EmailModule` добавен в `PaymentsModule`; `TenantsModule` добавен в `QuotesModule`.
- AC3 (read-only полици) е автоматично изпълнен — GET endpoints нямат `stripe_revoked` check.
- **Code Review fixes:**
  - M1: Добавен `createPendingEvent` в `mockCommissionsService` в `payments.service.spec.ts` + assertion за викането му
  - M2: HTML escaping в `email.service.ts` `sendStripeRevocationEmail()` — `tenantName` и `stripeAccountId` се ескейпват
  - L1: Добавен тест за "broker_admin email не е намерен" в `stripe-webhook.service.spec.ts`
  - L2: AC5 audit_log test разширен — проверява `stripeEventId`, `stripeAccountId`, `chargesEnabled` в metadata
  - L3: Дефиниран `TenantStatus` type в `tenant.entity.ts`; `updateStatus()` и `createTenant()` вече използват `TenantStatus` — открити 2 допълнителни status value: `stripe_connected` (admin-tenants.service.ts)
- 439/439 тестове минават; lint чист; build успешен.

### File List

branivo-api/src/modules/payments/stripe-webhook.service.ts
branivo-api/src/modules/payments/stripe-webhook.service.spec.ts
branivo-api/src/modules/payments/payments.service.ts
branivo-api/src/modules/payments/payments.service.spec.ts
branivo-api/src/modules/payments/payments.module.ts
branivo-api/src/modules/quotes/quotes.service.ts
branivo-api/src/modules/quotes/quotes.service.spec.ts
branivo-api/src/modules/quotes/quotes.module.ts
branivo-api/src/infrastructure/email/email.service.ts
branivo-api/src/modules/tenants/entities/tenant.entity.ts
branivo-api/src/modules/tenants/tenants.repository.ts
_bmad-output/implementation-artifacts/5-4-stripe-account-revocation-handling.md
_bmad-output/implementation-artifacts/sprint-status.yaml
