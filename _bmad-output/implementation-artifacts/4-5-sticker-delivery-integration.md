# Story 4.5: Sticker Delivery Integration

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an end-client,
I want to receive my ГО sticker by courier after purchasing a policy,
so that I can display it on my vehicle as legally required.

## Acceptance Criteria

1. **AC1 — Автоматична доставка при активация (feature flag on):**
   **Given** `features.sticker_delivery` е enabled за тенанта,
   **When** полицата се активира (след `payment_intent.succeeded` webhook),
   **Then** доставка заявка се изпраща автоматично чрез Speedy/Econt API — `logistics` BullMQ queue job `'logistics:sticker-create'` се queue-ва

2. **AC2 — Без доставка когато feature flag е off:**
   **Given** `features.sticker_delivery` е disabled,
   **When** полицата се активира,
   **Then** доставка НЕ се инициира — feature flag се проверява ПРЕДИ всяка queue заявка (в webhook service) И в logistics service (double-check guard)

3. **AC3 — Tracking информация за клиента:**
   **Given** стикерната доставка е инициирана,
   **When** клиентът прегледа статуса (`GET /api/v1/policies/:id/shipment`),
   **Then** вижда tracking номер и очаквана дата на доставка; endpoint изисква JWT auth и tenant scope

4. **AC4 — BullMQ retry и dead letter queue:**
   **Given** Speedy/Econt API fail-ва,
   **When** BullMQ retry се изпълни,
   **Then** job се retry-ва с exponential backoff (3 опита, 2000ms delay); след 3 неуспешни → dead letter queue + broker notification; ManualAdapter се активира автоматично за ръчна обработка

5. **AC5 — Delivery address задължителна при checkout (стикер ON):**
   **Given** `features.sticker_delivery` е enabled за тенанта,
   **When** end-client завършва purchase flow,
   **Then** `delivery_address` JSONB поле е задължително в `POST /api/v1/payments/create-intent` payload; адресът се съхранява в `policies` таблицата

## Tasks / Subtasks

### Backend — DB Migration

- [x] **Task 1: Migration — Добави `delivery_address` към `policies` и нова `shipments` таблица** (AC: #1, #3, #5)
  - [x] Файл: `branivo-api/src/infrastructure/database/migrations/1710000017000-AddStickerDelivery.ts`
  - [x] **ALTER TABLE policies:**
    ```sql
    ALTER TABLE policies ADD COLUMN IF NOT EXISTS delivery_address JSONB NULL;
    ```
  - [x] **CREATE TABLE shipments:**
    ```sql
    CREATE TABLE IF NOT EXISTS shipments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      policy_id UUID NOT NULL REFERENCES policies(id),
      provider VARCHAR(20) NOT NULL CHECK (provider IN ('speedy', 'econt', 'manual')),
      tracking_number VARCHAR(100) NULL,
      estimated_delivery_date DATE NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'delivered', 'failed')),
      receipt_s3_key VARCHAR(500) NULL,   -- MANDATORY per architecture (може да е NULL в момента на creation)
      delivery_address JSONB NOT NULL,
      error_message TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL
    );
    CREATE INDEX IF NOT EXISTS idx_shipments_tenant_id ON shipments(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_shipments_policy_id ON shipments(policy_id);
    ```

### Backend — Entities

- [x] **Task 2: Създай `Shipment` entity** (AC: #1, #3)
  - [x] Файл: `branivo-api/src/modules/logistics/entities/shipment.entity.ts`
  - [x] Дефинирай `DeliveryAddress` interface в `branivo-api/src/modules/logistics/interfaces/delivery-address.interface.ts`

- [x] **Task 3: Update `Policy` entity** (AC: #5)
  - [x] Файл: `branivo-api/src/modules/policies/entities/policy.entity.ts`
  - [x] Добави `deliveryAddress!: DeliveryAddress | null;`

### Backend — Logistics Adapters

- [x] **Task 4: Дефинирай `LogisticsAdapter` interface** (AC: #1, #4)
  - [x] Файл: `branivo-api/src/modules/logistics/adapters/logistics-adapter.interface.ts`

- [x] **Task 5: Създай `SpeedyAdapter`** (AC: #1, #4)
  - [x] Файл: `branivo-api/src/modules/logistics/adapters/speedy.adapter.ts`

- [x] **Task 6: Създай `EcontAdapter`** (AC: #1, #4)
  - [x] Файл: `branivo-api/src/modules/logistics/adapters/econt.adapter.ts`

- [x] **Task 7: Създай `ManualAdapter`** (AC: #4)
  - [x] Файл: `branivo-api/src/modules/logistics/adapters/manual.adapter.ts`
  - [x] Добави `notifyBroker()` метод към `NotificationsService`

### Backend — Shipments Repository

- [x] **Task 8: Създай `ShipmentsRepository`** (AC: #1, #3, #4)
  - [x] Файл: `branivo-api/src/modules/logistics/shipments.repository.ts`

### Backend — Logistics Service

- [x] **Task 9: Създай `LogisticsService`** (AC: #1, #2, #3, #4)
  - [x] Файл: `branivo-api/src/modules/logistics/logistics.service.ts`
  - [x] `StickerDeliveryJobPayload` interface в `interfaces/sticker-delivery-job.payload.ts`

### Backend — Logistics Processor

- [x] **Task 10: Създай `LogisticsProcessor`** (AC: #1, #4)
  - [x] Файл: `branivo-api/src/modules/logistics/logistics.processor.ts`
  - [x] Job name: `'logistics:sticker-create'`

### Backend — Logistics Module

- [x] **Task 11: Създай `LogisticsModule`** (AC: #1)
  - [x] Файл: `branivo-api/src/modules/logistics/logistics.module.ts`

### Backend — Update Stripe Webhook (Queue Logistics Job)

- [x] **Task 12: Update `stripe-webhook.service.ts` — queue logistics job след активация** (AC: #1, #2)
  - [x] Файл: `branivo-api/src/modules/payments/stripe-webhook.service.ts`
  - [x] Премахна TODO коментара

### Backend — Update Payment Create Intent (Delivery Address)

- [x] **Task 13: Update `create-payment-intent` endpoint — приема `deliveryAddress`** (AC: #5)
  - [x] Създай `DeliveryAddressDto` в `branivo-api/src/modules/payments/dto/delivery-address.dto.ts`
  - [x] Update `create-payment-intent.dto.ts`
  - [x] `deliveryAddress` се съхранява в payment metadata → прехвърля се в policy при webhook

### Backend — Update Policies (findById without scope)

- [x] **Task 14: SKIP — `findByIdWithoutScope` вече съществува от Story 4.4** (AC: #1)

### Backend — Policies Controller (Shipment Endpoint)

- [x] **Task 15: `GET /api/v1/policies/:id/shipment`** (AC: #3)
  - [x] Файл: `branivo-api/src/modules/policies/policies.controller.ts`
  - [x] Response DTO `PolicyShipmentResponseDto`

### Backend — AppModule Update

- [x] **Task 16: Регистрирай `LogisticsModule` в `AppModule`** (AC: #1)
  - [x] Файл: `branivo-api/src/app.module.ts`

### Backend — Seed Update

- [x] **Task 17: Update seed — добави `sticker_delivery: true` за demo тенанта** (AC: #1, #2)
  - [x] Файл: `branivo-api/src/infrastructure/database/seed.service.ts`
  - [x] Добави env vars в `.env.example`

### Backend — Тестове

- [x] **Task 18: Unit тест `LogisticsService`** (AC: #1, #2, #3, #4)
  - [x] Файл: `branivo-api/src/modules/logistics/logistics.service.spec.ts`

- [x] **Task 19: Integration тест `GET /api/v1/policies/:id/shipment`**
  - [x] Файл: `branivo-api/src/modules/policies/policies.controller.spec.ts` (добавен нов describe block)

### PWA (branivo-web)

- [x] **Task 20: Добави tracking info в Policy Wallet page** (AC: #3)
  - [x] Файл: `branivo-web/src/app/[locale]/(client)/wallet/page.tsx`

- [x] **Task 21: Component тест за shipment tracking** (AC: #3)
  - [x] Файл: `branivo-web/src/__tests__/client/policy-wallet.test.tsx`

### Flutter (branivo_app)

- [x] **Task 22: Добави shipment tracking в Policy Wallet screen** (AC: #3)
  - [x] `PolicyDocument` Hive модела — нови полета trackingNumber, estimatedDeliveryDate, shipmentStatus
  - [x] `PolicyWalletBloc` — зарежда shipment данни паралелно с полиците
  - [x] `PolicyWalletScreen` — показва tracking section

- [x] **Task 23: Widget тест за shipment tracking** (AC: #3)
  - [x] Файл: `branivo_app/test/features/policies/presentation/policy_wallet_screen_test.dart`

---

## Dev Notes

### Критични архитектурни правила

1. **Job naming:** `'logistics:sticker-create'` — НЕ `'sticker-create'` или `'STICKER'`. Следва `{queue}:{action}` convention от architecture.md (lines 610-619)
2. **Processor MAX 20 реда** — само dispatch, никаква бизнес логика
3. **Feature flag double-check:** веднъж в stripe-webhook (преди queue), веднъж в LogisticsService (при обработка)
4. **НИКОГА** не давай public S3 ACL — receipt_s3_key е за future use
5. **НИКОГА** не логвай Speedy/Econt credentials
6. **НИКОГА** не правиш DB заявка без tenant_id scope (освен в job context с findByIdWithoutScope)
7. **ManualAdapter** е safety net — при adapter failure broker получава notification за ръчна обработка

### Queue Integration Pattern (reference от Story 4.3/4.4)

```typescript
// В stripe-webhook.service.ts — след activatePolicy():
if (tenant?.features?.['sticker_delivery'] === true && policy.deliveryAddress) {
  await this.logisticsQueue.add(
    'logistics:sticker-create',   // EXACT job name — НЕ ПРОМЕНИ
    { policyId: policy.id, tenantId: payment.tenantId, policyNumber: policy.policyNumber },
    { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100 },
  );
}
```

### Adapter Selection Logic

Tenant config може да задава предпочитан провайдер. За MVP:
- Default: Speedy
- Fallback (при failure): retry 3x → ManualAdapter

```typescript
// В LogisticsService.initiateDelivery():
const provider = tenant.config?.['preferredLogisticsProvider'] ?? 'speedy';
const adapter = provider === 'econt' ? this.econtAdapter : this.speedyAdapter;
```

### Delivery Address Flow

```
End-client checkout → POST /payments/create-intent { deliveryAddress: {...} }
                    ↓
              Stored in payment.metadata.deliveryAddress (JSONB)
                    ↓
  payment_intent.succeeded webhook → extracts deliveryAddress from payment.metadata
                    ↓
  Policy created with deliveryAddress field populated
                    ↓
  If delivery_address exists AND sticker_delivery enabled → queue logistics job
                    ↓
  LogisticsProcessor → LogisticsService.initiateDelivery()
                    ↓
  SpeedyAdapter/EcontAdapter → create shipment → store tracking number
```

### Speedy API Basics (Bulgarian courier)

Speedy v3 REST API:
- `POST https://api.speedy.bg/v3/shipment` — създаване на пратка
- Authentication: `{ "userName": "...", "password": "..." }` в request body
- Важни полета: `recipient.address`, `service.serviceId` (за стандартна доставка)
- Response: `{ "id": "...", "parcels": [{ "id": "...", "seqNo": 1 }] }`
- Tracking: `POST https://api.speedy.bg/v3/track` с `{ "parcels": [{ "id": "..." }] }`

За MVP — tracking number = `response.parcels[0].id`

### Econt API Basics

Econt REST 2.0:
- `POST https://ee.econt.com/services/Shipments2.0/create` — създаване
- Authentication: Basic Auth header
- Response: `{ "shipmentStatus": { "shipmentNumber": "..." } }`

За MVP — tracking number = `response.shipmentStatus.shipmentNumber`

### QUEUE_LOGISTICS константа (вече регистрирана)

```typescript
// branivo-api/src/infrastructure/queues/queue.module.ts
export const QUEUE_LOGISTICS = 'logistics'; // Вече регистрирана
```

**НЕ добавяй нова queue регистрация** — `logistics` queue вече съществува в `QueueModule`.

### Env Vars (нови)

```env
# Speedy (Bulgarian courier)
SPEEDY_API_URL=https://api.speedy.bg
SPEEDY_USERNAME=your-speedy-username
SPEEDY_PASSWORD=your-speedy-password

# Econt (Bulgarian courier)
ECONT_API_URL=https://ee.econt.com
ECONT_USERNAME=your-econt-username
ECONT_PASSWORD=your-econt-password
```

### Съществуваща инфраструктура (вече имплементирано)

- ✅ `policies` таблица — migration `1710000015000-CreatePoliciesTable.ts`
- ✅ `Policy` entity — `branivo-api/src/modules/policies/entities/policy.entity.ts`
- ✅ `PoliciesRepository` — включва `findByIdWithoutScope` (добавен в Story 4.4)
- ✅ `PolicyEventsRepository` — append-only, без UPDATE/DELETE
- ✅ BullMQ `logistics` queue — регистриран в `QueueModule` (QUEUE_LOGISTICS = 'logistics')
- ✅ `sticker_delivery` feature flag — дефиниран в `feature-flags.service.ts` (line ~50)
- ✅ `FeatureFlagGuard` — `branivo-api/src/common/guards/feature-flag.guard.ts`
- ✅ `NotificationsService` — `branivo-api/src/modules/notifications/notifications.service.ts` (stub — добави `notifyBroker()` метод)
- ✅ `stripe-webhook.service.ts` — queue pattern за reference (lines 129-143)
- ✅ `hive` + `hive_flutter` — инсталирани в Flutter

### Project Structure Notes

**Нова структура (logistics модул):**
```
branivo-api/src/
├── modules/
│   └── logistics/
│       ├── adapters/
│       │   ├── logistics-adapter.interface.ts   # НОВО
│       │   ├── speedy.adapter.ts                # НОВО
│       │   ├── econt.adapter.ts                 # НОВО
│       │   └── manual.adapter.ts               # НОВО
│       ├── entities/
│       │   └── shipment.entity.ts              # НОВО
│       ├── interfaces/
│       │   ├── delivery-address.interface.ts   # НОВО
│       │   └── sticker-delivery-job.payload.ts # НОВО
│       ├── logistics.module.ts                 # НОВО
│       ├── logistics.processor.ts              # НОВО — MAX 20 реда
│       ├── logistics.service.ts                # НОВО — бизнес логика
│       ├── logistics.service.spec.ts           # НОВО — unit тести
│       └── shipments.repository.ts             # НОВО
├── infrastructure/database/migrations/
│   └── 1710000017000-AddStickerDelivery.ts     # НОВО
└── modules/policies/
    ├── entities/policy.entity.ts               # UPDATE — deliveryAddress поле
    ├── policies.controller.ts                  # UPDATE — GET /policies/:id/shipment
    └── (PolicyShipmentResponseDto вграден в controller)
```

**PWA:**
```
branivo-web/src/app/[locale]/(client)/wallet/
├── page.tsx        # UPDATE — добави shipment tracking section
└── __tests__/client/policy-wallet.test.tsx  # UPDATE — добави tracking тест
```

**Flutter:**
```
branivo_app/lib/features/policies/
├── data/models/policy_document.dart            # UPDATE — добави tracking полета
├── data/models/policy_document.g.dart          # UPDATE — регенерирано
├── data/repositories/policy_repository.dart    # UPDATE — getShipment метод
├── bloc/policy_wallet_bloc.dart                # UPDATE — зарежда shipments
├── bloc/policy_wallet_state.dart               # UPDATE — shipments в state
└── presentation/screens/policy_wallet_screen.dart  # UPDATE — tracking UI
```

### Git workflow (задължително преди имплементация)

```bash
git fetch origin
git switch main
git pull origin main
git switch -c feature/story-4-5-sticker-delivery-integration
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

- Story 4.3 (webhook pattern): `_bmad-output/implementation-artifacts/4-3-policy-activation-via-stripe-webhook.md`
- Story 4.4 (PDF delivery pattern): `_bmad-output/implementation-artifacts/4-4-policy-document-delivery.md`
- Architecture logistics module: `_bmad-output/planning-artifacts/architecture.md` lines 916-925 (logistics/ structure), lines 610-619 (job naming), lines 80-85 (queue architecture)
- QueueModule constants: `branivo-api/src/infrastructure/queues/queue.module.ts` (QUEUE_LOGISTICS)
- Feature flags: `branivo-api/src/modules/tenants/feature-flags.service.ts` (`sticker_delivery` flag)
- FeatureFlagGuard: `branivo-api/src/common/guards/feature-flag.guard.ts`
- Stripe webhook (queue integration reference): `branivo-api/src/modules/payments/stripe-webhook.service.ts` lines 129-143

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Circular dependency между PoliciesModule и LogisticsModule → решено чрез директно предоставяне на ShipmentsRepository в PoliciesModule (без forwardRef)
- TS1272 build error: `DeliveryAddress` в Shipment entity → решено с `import type`
- TS2352: `tenant.features['preferredLogisticsProvider'] as string` → решено с `as unknown as string | undefined`
- `@typescript-eslint/require-await` в NotificationsService → решено с `return Promise.resolve()`
- Flutter test: `find.text('SPEEDY-XYZ')` не намираше → решено с `find.textContaining('SPEEDY-XYZ')`

### Completion Notes List

- ✅ Task 1-23: Всички задачи имплементирани
- ✅ LogisticsModule с SpeedyAdapter, EcontAdapter, ManualAdapter
- ✅ BullMQ processor с job name `'logistics:sticker-create'` (≤20 реда)
- ✅ Double feature flag check: stripe-webhook + LogisticsService
- ✅ delivery_address flow: create-intent → payment metadata → policy entity → webhook job
- ✅ GET /policies/:id/shipment с JWT auth и tenant scope
- ✅ PWA + Flutter wallet screens обновени с tracking UI
- ✅ Всички CI проверки минават: lint ✅, test:cov ✅ (382 tests), build ✅, flutter test ✅ (64 tests), web tests ✅ (127 tests)

### File List

- `branivo-api/src/infrastructure/database/migrations/1710000017000-AddStickerDelivery.ts` (НОВО)
- `branivo-api/src/modules/logistics/interfaces/delivery-address.interface.ts` (НОВО)
- `branivo-api/src/modules/logistics/interfaces/sticker-delivery-job.payload.ts` (НОВО)
- `branivo-api/src/modules/logistics/entities/shipment.entity.ts` (НОВО)
- `branivo-api/src/modules/logistics/adapters/logistics-adapter.interface.ts` (НОВО)
- `branivo-api/src/modules/logistics/adapters/speedy.adapter.ts` (НОВО)
- `branivo-api/src/modules/logistics/adapters/econt.adapter.ts` (НОВО)
- `branivo-api/src/modules/logistics/adapters/manual.adapter.ts` (НОВО)
- `branivo-api/src/modules/logistics/shipments.repository.ts` (НОВО)
- `branivo-api/src/modules/logistics/logistics.service.ts` (НОВО)
- `branivo-api/src/modules/logistics/logistics.service.spec.ts` (НОВО)
- `branivo-api/src/modules/logistics/logistics.processor.ts` (НОВО)
- `branivo-api/src/modules/logistics/logistics.module.ts` (НОВО)
- `branivo-api/src/modules/policies/entities/policy.entity.ts` (UPDATE)
- `branivo-api/src/modules/policies/policies.controller.ts` (UPDATE)
- `branivo-api/src/modules/policies/policies.controller.spec.ts` (UPDATE)
- `branivo-api/src/modules/policies/policies.module.ts` (UPDATE)
- `branivo-api/src/modules/payments/dto/delivery-address.dto.ts` (НОВО)
- `branivo-api/src/modules/payments/dto/create-payment-intent.dto.ts` (UPDATE)
- `branivo-api/src/modules/payments/payments.service.ts` (UPDATE)
- `branivo-api/src/modules/payments/stripe-webhook.service.ts` (UPDATE)
- `branivo-api/src/modules/payments/stripe-webhook.service.spec.ts` (UPDATE)
- `branivo-api/src/modules/notifications/notifications.service.ts` (UPDATE)
- `branivo-api/src/app.module.ts` (UPDATE)
- `branivo-api/src/infrastructure/database/seed.service.ts` (UPDATE)
- `branivo-api/.env.example` (UPDATE)
- `branivo-web/src/app/[locale]/(client)/wallet/page.tsx` (UPDATE)
- `branivo-web/src/__tests__/client/policy-wallet.test.tsx` (UPDATE)
- `branivo_app/lib/features/policies/data/models/policy_document.dart` (UPDATE)
- `branivo_app/lib/features/policies/data/models/policy_document.g.dart` (UPDATE)
- `branivo_app/lib/features/policies/data/repositories/policy_repository.dart` (UPDATE)
- `branivo_app/lib/features/policies/bloc/policy_wallet_bloc.dart` (UPDATE)
- `branivo_app/lib/features/policies/bloc/policy_wallet_state.dart` (UPDATE)
- `branivo_app/lib/features/policies/presentation/screens/policy_wallet_screen.dart` (UPDATE)
- `branivo_app/test/features/policies/presentation/policy_wallet_screen_test.dart` (UPDATE)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE)
- `_bmad-output/implementation-artifacts/4-5-sticker-delivery-integration.md` (UPDATE)

### Change Log

- 2026-03-21: Story 4.5 — Sticker Delivery Integration имплементирана от claude-sonnet-4-6
