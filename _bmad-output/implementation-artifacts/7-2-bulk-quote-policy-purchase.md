# Story 7.2: Bulk Quote & Policy Purchase

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Fleet Admin,
I want to get quotes and purchase policies for multiple vehicles simultaneously,
So that I can insure my entire fleet efficiently without processing each vehicle individually.

## Acceptance Criteria

1. **AC1 — Паралелни bulk quotes:**
   **Given** Fleet Admin избира едно или повече МПС от Fleet Dashboard,
   **When** натисне "Получи оферти за избраните",
   **Then** паралелни quote заявки се изпращат за всички избрани МПС едновременно (`Promise.allSettled`), и резултатите се групират по vehicle.

2. **AC2 — Individual Stripe PaymentIntent per полица:**
   **Given** bulk quotes са върнати и Fleet Admin избира оферта per МПС,
   **When** натисне "Купи избраните",
   **Then** individual Stripe PaymentIntent се създава за всяка избрана оферта — без saga complexity; `Promise.allSettled` за паралелно изпълнение.

3. **AC3 — Partial success допустим:**
   **Given** bulk purchase се обработва,
   **When** някои полици успяват, а други се провалят,
   **Then** отговорът съдържа `{ succeeded: [...], failed: [...], summary: { total, succeeded, failed } }` и Fleet Admin вижда "X/Y успешни" breakdown с retry бутон за failed полиците.

4. **AC4 — Idempotency при retry:**
   **Given** failed полиците съществуват след bulk purchase,
   **When** Fleet Admin натисне "Retry" за failed МПС,
   **Then** само failed полиците се retry-ват; успешните не се дублират (съществуващият `idempotencyKey = ${tenantId}:${quoteId}` в `PaymentsService` гарантира това автоматично).

5. **AC5 — Webhook активация (Story 4.3 flow — непроменен):**
   **Given** всяка полица е платена,
   **When** `payment_intent.succeeded` webhook е получен per полица,
   **Then** всяка полица се активира независимо чрез съществуващия `StripeWebhookService` — без промени по webhook flow.

6. **AC6 — Feature flag guard:**
   **Given** `features.fleet` е деактивиран за тенанта,
   **When** Fleet Admin се опита да достъпи bulk quote или bulk purchase,
   **Then** получава `404 Not Found`.

7. **AC7 — Tenant isolation:**
   **Given** Fleet Admin е логнат,
   **When** bulk quote заявка е изпратена,
   **Then** само МПС от собствения тенант могат да бъдат включени в bulk операцията — `tenant_id` scope задължително.

## Tasks / Subtasks

### Backend — DTOs

- [x] **Task 1: Създай Bulk Quote DTOs** (AC: #1, #7)
  - [ ] Файл: `branivo-api/src/modules/fleet/dto/bulk-quote-request.dto.ts`
    - `vehicleIds: string[]` с `@IsArray() @ArrayNotEmpty() @IsUUID('4', { each: true }) @ArrayMaxSize(50)`
  - [ ] Файл: `branivo-api/src/modules/fleet/dto/bulk-quote-response.dto.ts`
    - `results: VehicleQuoteResultDto[]` — array от per-vehicle results
    - `VehicleQuoteResultDto`: `{ vehicleId, licensePlate, make, model, offers: QuoteOfferDto[], sessionToken: string, status: 'success' | 'partial' | 'failed' }`
    - Reuse `QuoteOfferDto` от `modules/quotes/dto/quote-offer.dto.ts` — import type, не дублирай

- [x] **Task 2: Създай Bulk Purchase DTOs** (AC: #2, #3, #4)
  - [ ] Файл: `branivo-api/src/modules/fleet/dto/bulk-purchase-request.dto.ts`
    - `items: BulkPurchaseItemDto[]` с `@IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => BulkPurchaseItemDto) @ArrayMaxSize(50)`
    - `BulkPurchaseItemDto`: `{ vehicleId: string (@IsUUID), quoteId: string (@IsUUID) }`
  - [ ] Файл: `branivo-api/src/modules/fleet/dto/bulk-purchase-response.dto.ts`
    - `succeeded: BulkPurchaseSuccessItemDto[]` — `{ vehicleId, quoteId, clientSecret, paymentId }`
    - `failed: BulkPurchaseFailedItemDto[]` — `{ vehicleId, quoteId, error: string }`
    - `summary: { total: number, succeeded: number, failed: number }`

### Backend — Service

- [x] **Task 3: Създай `FleetBulkService`** (AC: #1-#5, #7)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet-bulk.service.ts`
  - [ ] Инжектирай: `QuotesService`, `PaymentsService`, `FleetRepository`, `TenantContext`
  - [ ] **`bulkGetQuotes(vehicleIds: string[]): Promise<BulkQuoteResponseDto>`**
    - Зареди fleet vehicles за tenant: `FleetRepository.findManyByIds(tenantId, vehicleIds)` — задължителен tenant_id scope
    - Ако vehicleId не принадлежи на тенанта → пропусни го (tenant isolation)
    - За всяко vehicle: генерирай `sessionToken = fleet-bulk-${vehicleId}-${Date.now()}`
    - Извикай `QuotesService.createQuoteRequest({ sessionToken, vehicleData: { vin, licensePlate, make, model, year } })` в `Promise.allSettled()`
    - Групирай резултати по vehicle, върни `BulkQuoteResponseDto`
  - [ ] **`bulkPurchase(items: BulkPurchaseItemDto[]): Promise<BulkPurchaseResponseDto>`**
    - За всеки item: извикай `PaymentsService.createIntent({ quoteId: item.quoteId })` в `Promise.allSettled()`
    - Събери `succeeded` и `failed` arrays
    - Idempotency е автоматичен: `PaymentsService.createIntent()` вече използва `${tenantId}:${quoteId}` като idempotency key — повторни извиквания за вече-успешни quotes ще върнат съществуващия PI
    - Върни `{ succeeded, failed, summary }` — никога не хвърляй exception при partial failure
  - [ ] **`findManyByIds(tenantId: string, vehicleIds: string[])`** — добави в `FleetRepository`:
    - Raw query или TypeORM: `SELECT fv.*, v.license_plate, v.make, v.model, v.vin FROM fleet_vehicles fv JOIN vehicles v ON v.id = fv.vehicle_id WHERE fv.tenant_id = $1 AND fv.id = ANY($2) AND fv.deleted_at IS NULL AND v.deleted_at IS NULL`

### Backend — Controller

- [x] **Task 4: Добави bulk endpoints към `FleetController`** (AC: #1-#6)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet.controller.ts` (modify)
  - [ ] Добави `POST /fleet/bulk-quotes`:
    ```typescript
    @Post('bulk-quotes')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Get quotes for multiple fleet vehicles in parallel' })
    @ApiResponse({ status: 200, description: 'Bulk quote results per vehicle' })
    @ApiResponse({ status: 404, description: 'Fleet feature not enabled' })
    async bulkGetQuotes(@Body() dto: BulkQuoteRequestDto): Promise<BulkQuoteResponseDto> {
      return this.fleetBulkService.bulkGetQuotes(dto.vehicleIds);
    }
    ```
  - [ ] Добави `POST /fleet/bulk-purchase`:
    ```typescript
    @Post('bulk-purchase')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Purchase policies for multiple fleet vehicles' })
    @ApiResponse({ status: 200, description: 'Partial or full success — always 200, check summary' })
    async bulkPurchase(@Body() dto: BulkPurchaseRequestDto): Promise<BulkPurchaseResponseDto> {
      return this.fleetBulkService.bulkPurchase(dto.items);
    }
    ```
  - [ ] Вече съществуващите `@UseGuards`, `@Roles`, `@FeatureFlag` декоратори на class level важат за всички endpoints — не дублирай

### Backend — Module

- [x] **Task 5: Актуализирай `FleetModule`** (AC: #1-#5)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet.module.ts` (modify)
  - [ ] Добави `FleetBulkService` в providers
  - [ ] Добави `QuotesModule` в imports (за `QuotesService`)
  - [ ] Добави `PaymentsModule` в imports (за `PaymentsService`)
  - [ ] Провери дали `QuotesModule` и `PaymentsModule` правилно export-ват своите services

### Backend — Тестове

- [x] **Task 6: Unit тест за `FleetBulkService`** (AC: #1, #2, #3, #4, #7)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet-bulk.service.spec.ts`
  - [ ] Mock `QuotesService.createQuoteRequest()` и `PaymentsService.createIntent()` — не извиквай реален Stripe
  - [ ] Тест: `bulkGetQuotes` — паралелни заявки, grouping по vehicle, tenant scope
  - [ ] Тест: `bulkGetQuotes` — vehicle, което не принадлежи на тенанта → пропуска се
  - [ ] Тест: `bulkPurchase` — partial success сценарий (1 success, 1 failure) → summary коректен
  - [ ] Тест: `bulkPurchase` — всички success → `failed` array е празен
  - [ ] Тест: `bulkPurchase` — никога не хвърля exception при частичен failure
  - [ ] Тест: `bulkPurchase` — при retry на вече-успешен quote → `PaymentsService.createIntent()` се извиква само веднъж per item (idempotency handle в PaymentsService)

- [x] **Task 7: Интеграционен тест за bulk endpoints** (AC: #6, #7)
  - [ ] Файл: `branivo-api/src/modules/fleet/fleet.controller.spec.ts` (modify — добави bulk тестове)
  - [ ] `POST /fleet/bulk-quotes` без feature flag → 404
  - [ ] `POST /fleet/bulk-quotes` с невалидни UUID → 400
  - [ ] `POST /fleet/bulk-quotes` с `fleet_admin` роля + feature enabled → 200
  - [ ] `POST /fleet/bulk-purchase` с `broker_admin` роля + feature enabled → 200

### Next.js — Broker Portal

- [x] **Task 8: Добави multi-select и bulk action bar в Fleet Dashboard** (AC: #1, #3)
  - [ ] Файл: `branivo-web/src/app/[locale]/(broker)/fleet/page.tsx` (modify)
  - [ ] Добави `selectedVehicleIds: Set<string>` state
  - [ ] Добави checkbox колона в таблицата — `<input type="checkbox" checked={selectedVehicleIds.has(vehicle.id)} onChange={...} />`
  - [ ] "Select All" checkbox в header на таблицата
  - [ ] Bulk action bar (видим когато `selectedVehicleIds.size > 0`): `"${count} МПС избрани"` + бутон "Получи оферти"
  - [ ] onClick на "Получи оферти" → `router.push('/fleet/bulk-quotes?vehicleIds=...')`

- [x] **Task 9: Нова Bulk Quotes страница** (AC: #1, #3)
  - [ ] Файл: `branivo-web/src/app/[locale]/(broker)/fleet/bulk-quotes/page.tsx` (new)
  - [ ] `'use client'` — `useQuery` за `POST /api/v1/fleet/bulk-quotes`
  - [ ] Показва loading spinner (quote заявките са ~5s)
  - [ ] Таблица с ред per vehicle: licensePlate | make/model | оферти (цена, застраховател, `isRecommended`) | избор
  - [ ] Per vehicle: radio button за избор на оферта (pre-select `isRecommended`)
  - [ ] При vehicle с `status: 'failed'` → показва "Не са намерени оферти" в реда
  - [ ] Бутон "Купи избраните" → `POST /api/v1/fleet/bulk-purchase`

- [x] **Task 10: Bulk Purchase Result компонент** (AC: #2, #3, #4)
  - [ ] Файл: `branivo-web/src/components/fleet/BulkPurchaseResult.tsx` (new)
  - [ ] Props: `{ succeeded: BulkPurchaseSuccessItem[], failed: BulkPurchaseFailedItem[], summary }`
  - [ ] Показва: "X/Y полици са закупени успешно"
  - [ ] Failed items: списък с регистрационен номер + error message + "Retry" бутон
  - [ ] "Retry" → нова bulk purchase заявка само с failed `quoteId` и `vehicleId`
  - [ ] Success items: линкове към `/policies/{policyId}` ако е наличен

### Flutter — Fleet App

- [x] **Task 11: Multi-select в `FleetDashboardScreen`** (AC: #1)
  - [ ] Файл: `branivo_app/lib/features/fleet/screens/fleet_dashboard_screen.dart` (modify)
  - [ ] Добави `_selectedVehicleIds: Set<String>` state
  - [ ] Long press на `FleetVehicleCard` активира multi-select mode
  - [ ] В multi-select mode: checkbox overlay на всяка карта
  - [ ] Bottom action bar (animated — slide up): `"${count} избрани"` + бутон "Оферти"
  - [ ] onClick "Оферти" → `Navigator.push(FleetBulkQuoteScreen(vehicleIds: _selectedVehicleIds.toList()))`

- [x] **Task 12: `FleetBulkQuoteScreen`** (AC: #1, #2, #3)
  - [ ] Файл: `branivo_app/lib/features/fleet/screens/fleet_bulk_quote_screen.dart` (new)
  - [ ] StatefulWidget — при initState извиква bulk quote API
  - [ ] Loading: `CircularProgressIndicator` с текст "Зареждане на оферти..."
  - [ ] Резултат: `ListView` с `FleetBulkVehicleQuoteCard` per vehicle
  - [ ] `FleetBulkVehicleQuoteCard`: показва vehicle info + dropdown/radio за избор на оферта
  - [ ] FAB: "Купи избраните (N)" → при натискане извиква bulk purchase API
  - [ ] Показва `FleetBulkPurchaseResultDialog` след purchase

- [x] **Task 13: `FleetBulkPurchaseResultDialog`** (AC: #3, #4)
  - [ ] Файл: `branivo_app/lib/features/fleet/widgets/fleet_bulk_purchase_result_dialog.dart` (new)
  - [ ] Показва summary: "X/Y полици купени успешно"
  - [ ] Failed list: vehicle licensePlate + error + "Retry" опция
  - [ ] Success: зелена икона + "Полицата ще бъде активирана при потвърдено плащане"

- [x] **Task 14: `FleetRepository` extension** (AC: #1)
  - [ ] Файл: `branivo_app/lib/features/fleet/data/repositories/fleet_repository.dart` (modify)
  - [ ] Добави `bulkGetQuotes(vehicleIds: List<String>): Future<BulkQuoteResponse>`
  - [ ] Добави `bulkPurchase(items: List<BulkPurchaseItem>): Future<BulkPurchaseResponse>`
  - [ ] Модели: `BulkQuoteResponse`, `VehicleQuoteResult`, `BulkPurchaseResponse`, `BulkPurchaseItem`
  - [ ] Файл: `branivo_app/lib/features/fleet/data/models/bulk_quote_models.dart` (new)

### Тестове

- [x] **Task 15: Next.js тест за `BulkPurchaseResult`** (AC: #3, #4)
  - [ ] Файл: `branivo-web/src/__tests__/broker/fleet/BulkPurchaseResult.test.tsx` (new)
  - [ ] Тест: рендира "X/Y успешни" summary коректно
  - [ ] Тест: показва retry бутон за failed items
  - [ ] Тест: failed list е празен когато всички успяват

- [x] **Task 16: Flutter widget тестове** (AC: #3)
  - [ ] Файл: `branivo_app/test/features/fleet/widgets/fleet_bulk_purchase_result_dialog_test.dart` (new)
  - [ ] Тест: показва коректен summary (all success, partial, all failed)
  - [ ] Тест: retry бутон е видим само при наличие на failed items

## Dev Notes

### Ключово Архитектурно Решение — Reuse на Съществуващи Services

**КРИТИЧНО:** Story 7.2 **НЕ** имплементира собствен quote или payment logic. Използва директно:
- `QuotesService.createQuoteRequest()` — вземи от `QuotesModule`
- `PaymentsService.createIntent()` — вземи от `PaymentsModule`

Тази стратегия гарантира:
- Circuit breaker за insurer API-та работи автоматично
- Scoring и препоръки работят автоматично
- Idempotency при retry работи автоматично
- Webhook активация (Story 4.3) работи без промени

### Idempotency при Bulk Purchase Retry — Ключово

**КРИТИЧНО:** Съществуващият `PaymentsService.createIntent()` вече проверява:
```typescript
const idempotencyKey = `${tenantId}:${dto.quoteId}`;
const existing = await this.paymentsRepo.findByIdempotencyKey(idempotencyKey);
if (existing) {
  return { clientSecret: existing.stripeClientSecret, ... }; // Връща existing PI
}
```

Това означава:
- Ако Fleet Admin retry-ва, вече-успешни quotes ще върнат existing PI (без нов Stripe charge)
- Само quotes, за които PI не е бил създаден, ще преминат през нов Stripe call
- Фронтендът трябва да изпрати **всички** failed items при retry (не само succeeded)
- **НЕ прилагай допълнителна idempotency логика в `FleetBulkService`** — вече е налице в `PaymentsService`

### Quote sessionToken за Bulk Fleet

За fleet bulk quotes, синтетичен `sessionToken` per vehicle се генерира:
```typescript
const sessionToken = `fleet-bulk-${vehicleId}-${Date.now()}`;
```

Това позволява `QuotesService.createQuoteRequest()` да съхрани quotes в `quotes` таблицата с правилния `session_token`. Полето `quotes.vehicle_id` вече е `nullable` — **задължително попълни го** при fleet bulk quote:
```typescript
// В QuotesService.createQuoteRequest() — vehicle_id се попълва при fleet context
// Но QuotesService.createQuoteRequest() не знае за vehicleId директно
// Затова FleetBulkService трябва да извика QuotesRepository директно ИЛИ
// да добави vehicleId към CreateQuoteDto (preferred clean approach)
```

**Предпочитан подход:** Добави `vehicleId?: string` като optional поле към `CreateQuoteDto`:
```typescript
// branivo-api/src/modules/quotes/dto/create-quote.dto.ts (modify)
@IsOptional()
@IsUUID()
vehicleId?: string; // За fleet bulk quote context
```
И в `QuotesService.bulkCreate()`: попълни `vehicleId` когато е предоставен.

### Module Import Chain

```typescript
// branivo-api/src/modules/fleet/fleet.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([FleetVehicle]),
    TenantContextModule,
    TenantsModule,      // за FeatureFlagGuard
    QuotesModule,       // за QuotesService
    PaymentsModule,     // за PaymentsService
  ],
  providers: [FleetService, FleetBulkService, FleetRepository],
  controllers: [FleetController],
})
export class FleetModule {}
```

**Провери дали `QuotesModule` export-ва `QuotesService`** — ако не, добави `exports: [QuotesService]` в `quotes.module.ts`.
**Провери дали `PaymentsModule` export-ва `PaymentsService`** — ако не, добави `exports: [PaymentsService]`.

### Обработка на Partial Failure — Задължително

`bulkPurchase()` **НИКОГА** не хвърля exception дори при пълен провал. Винаги връща:
```typescript
return {
  succeeded: [...],
  failed: [...],
  summary: { total: items.length, succeeded: succeeded.length, failed: failed.length }
};
```

```typescript
const results = await Promise.allSettled(
  items.map((item) =>
    this.paymentsService.createIntent({ quoteId: item.quoteId })
  )
);

for (let i = 0; i < results.length; i++) {
  const result = results[i];
  const item = items[i];
  if (result.status === 'fulfilled') {
    succeeded.push({ vehicleId: item.vehicleId, quoteId: item.quoteId, ...result.value });
  } else {
    const err = result.reason as Error;
    failed.push({ vehicleId: item.vehicleId, quoteId: item.quoteId, error: err.message });
  }
}
```

### Fleet Repository Extension

Добави `findManyByIds()` в съществуващия `FleetRepository`:
```typescript
async findManyByIds(
  tenantId: string,
  vehicleIds: string[],
): Promise<FleetVehicleWithVehicleData[]> {
  return this.dataSource.query<FleetVehicleWithVehicleData[]>(
    `SELECT fv.id, fv.vehicle_id, v.license_plate, v.make, v.model, v.vin, v.year
     FROM fleet_vehicles fv
     JOIN vehicles v ON v.id = fv.vehicle_id AND v.deleted_at IS NULL
     WHERE fv.tenant_id = $1
       AND fv.id = ANY($2)
       AND fv.deleted_at IS NULL`,
    [tenantId, vehicleIds],
  );
}
```

**КРИТИЧНО:** `ANY($2)` с PostgreSQL UUID array — TypeORM `dataSource.query()` приема `vehicleIds: string[]` директно като PostgreSQL array параметър. Не е нужен допълнителен mapping.

### Важни Patterns от Story 7.1

Следва точно същите patterns:
- `@UseGuards(JwtAuthGuard, RolesGuard, FeatureFlagGuard)` на class level в `FleetController` — нови endpoints наследяват автоматично
- `TenantContext.getTenantId()` — задължително в `FleetBulkService`, не като параметър
- Lint: никога `any` тип — използвай точни типове
- `/* eslint-disable @typescript-eslint/unbound-method */` само в spec файлове където е нужно

### Следващата Migration

Story 7.2 **НЕ изисква нова migration** — използва съществуващи таблици:
- `quotes` (session_token, vehicle_id е вече nullable)
- `payments` (idempotency_key вече съществува)
- `fleet_vehicles` (от Story 7.1)

Ако по бизнес логика е нужно да се следи "кой bulk batch" е поръчан, това е Phase 3 изискване — НЕ добавяй сега.

### Throttle на Bulk Endpoints

Bulk endpoints трябва да имат по-строг throttle от single endpoints:
```typescript
@Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 bulk заявки per minute
@Post('bulk-quotes')
```

### API Endpoints

```
POST /fleet/bulk-quotes
Request: { "vehicleIds": ["uuid1", "uuid2", ...] }  (max 50)
Response:
{
  "results": [
    {
      "vehicleId": "uuid1",
      "licensePlate": "СА1234АВ",
      "make": "Toyota",
      "model": "Corolla",
      "sessionToken": "fleet-bulk-uuid1-1742123456789",
      "status": "success",
      "offers": [
        { "id": "quote-uuid", "insurerName": "ДЗИ", "price": 450.00, "isRecommended": true, ... }
      ]
    },
    {
      "vehicleId": "uuid2",
      "status": "failed",
      "offers": []
    }
  ]
}

POST /fleet/bulk-purchase
Request: { "items": [{ "vehicleId": "uuid1", "quoteId": "quote-uuid" }] }
Response:
{
  "succeeded": [{ "vehicleId": "uuid1", "quoteId": "quote-uuid", "clientSecret": "pi_..._secret_...", "paymentId": "pi_..." }],
  "failed": [{ "vehicleId": "uuid2", "quoteId": "quote-uuid2", "error": "Quote is not available for purchase" }],
  "summary": { "total": 2, "succeeded": 1, "failed": 1 }
}
```

### Project Structure Notes

Добавени файлове към съществуващия fleet модул:
```
branivo-api/src/modules/fleet/
├── fleet.module.ts          (modify — add FleetBulkService, QuotesModule, PaymentsModule)
├── fleet.controller.ts      (modify — add POST bulk-quotes, POST bulk-purchase)
├── fleet-bulk.service.ts    (new)
├── fleet-bulk.service.spec.ts (new)
├── fleet.controller.spec.ts (modify — add bulk endpoint tests)
├── fleet.repository.ts      (modify — add findManyByIds())
├── dto/
│   ├── bulk-quote-request.dto.ts    (new)
│   ├── bulk-quote-response.dto.ts   (new)
│   ├── bulk-purchase-request.dto.ts (new)
│   └── bulk-purchase-response.dto.ts (new)
└── (existing files unchanged)

branivo-api/src/modules/quotes/dto/create-quote.dto.ts  (modify — add optional vehicleId)
branivo-api/src/modules/quotes/quotes.service.ts        (modify — populate vehicleId in bulkCreate)

branivo-web/src/app/[locale]/(broker)/fleet/page.tsx    (modify — add multi-select)
branivo-web/src/app/[locale]/(broker)/fleet/bulk-quotes/page.tsx (new)
branivo-web/src/components/fleet/BulkPurchaseResult.tsx (new)
branivo-web/src/__tests__/broker/fleet/BulkPurchaseResult.test.tsx (new)

branivo_app/lib/features/fleet/data/models/bulk_quote_models.dart (new)
branivo_app/lib/features/fleet/data/repositories/fleet_repository.dart (modify)
branivo_app/lib/features/fleet/screens/fleet_bulk_quote_screen.dart (new)
branivo_app/lib/features/fleet/widgets/fleet_bulk_purchase_result_dialog.dart (new)
branivo_app/test/features/fleet/widgets/fleet_bulk_purchase_result_dialog_test.dart (new)
```

### Зависимости от Предишни Stories

- **Story 7.1** — `fleet_vehicles` таблица, `FleetController` (с guards), `FleetRepository`, `FeatureFlagGuard` вече съществуват ✅
- **Story 4.1 (Parallel Quote Aggregation)** — `QuotesService`, insurer adapters, circuit breaker, scoring ✅
- **Story 4.2 (Policy Purchase with Stripe 3DS)** — `PaymentsService.createIntent()`, idempotency key механизъм ✅
- **Story 4.3 (Policy Activation via Stripe Webhook)** — `StripeWebhookService` — не се променя ✅

### Важни ЗАБРАНИ

- **НЕ** дублирай insurer adapter логика — използвай `QuotesService`
- **НЕ** дублирай Stripe PaymentIntent логика — използвай `PaymentsService`
- **НЕ** хвърляй HTTP Exception при partial failure в `bulkPurchase()` — винаги 200 с breakdown
- **НЕ** добавяй saga / distributed transaction логика
- **НЕ** добавяй нова migration за Story 7.2
- **НЕ** предавай `tenantId` като функционален параметър — използвай `TenantContext`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.2] — User story, AC
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7] — Fleet management бизнес контекст
- [Source: _bmad-output/planning-artifacts/prd.md#Journey 6] — Bulk renewal journey (Красимир fleet example)
- [Source: _bmad-output/planning-artifacts/prd.md#FR44-FR45] — Functional requirements
- [Source: branivo-api/src/modules/quotes/quotes.service.ts] — `createQuoteRequest()` — reuse pattern
- [Source: branivo-api/src/modules/payments/payments.service.ts] — `createIntent()`, idempotency key
- [Source: branivo-api/src/modules/payments/payments.service.ts:38] — `idempotencyKey = ${tenantId}:${quoteId}`
- [Source: branivo-api/src/modules/quotes/entities/quote.entity.ts:32] — `vehicle_id` е nullable, вече поддържа fleet context
- [Source: _bmad-output/implementation-artifacts/7-1-fleet-vehicle-status-dashboard.md] — Story 7.1 patterns, existing fleet module structure
- [Source: branivo-api/src/modules/fleet/fleet.module.ts] — Съществуваща fleet module структура
- [Source: branivo-api/src/modules/fleet/fleet.controller.ts] — Съществуваща guard конфигурация

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List

- branivo-api/src/modules/fleet/dto/bulk-quote-request.dto.ts (new)
- branivo-api/src/modules/fleet/dto/bulk-quote-response.dto.ts (new)
- branivo-api/src/modules/fleet/dto/bulk-purchase-request.dto.ts (new)
- branivo-api/src/modules/fleet/dto/bulk-purchase-response.dto.ts (new)
- branivo-api/src/modules/fleet/fleet-bulk.service.ts (new)
- branivo-api/src/modules/fleet/fleet-bulk.service.spec.ts (new)
- branivo-api/src/modules/fleet/fleet.controller.ts (modified)
- branivo-api/src/modules/fleet/fleet.controller.spec.ts (modified)
- branivo-api/src/modules/fleet/fleet.module.ts (modified)
- branivo-api/src/modules/fleet/fleet.repository.ts (modified)
- branivo-web/src/app/[locale]/(broker)/fleet/page.tsx (modified)
- branivo-web/src/app/[locale]/(broker)/fleet/bulk-quotes/page.tsx (new)
- branivo-web/src/components/fleet/BulkPurchaseResult.tsx (new)
- branivo-web/src/components/fleet/BulkPurchaseResult.test.tsx (new)
- branivo_app/lib/features/fleet/data/models/bulk_quote_models.dart (new)
- branivo_app/lib/features/fleet/data/repositories/fleet_repository.dart (modified)
- branivo_app/lib/features/fleet/screens/fleet_dashboard_screen.dart (modified)
- branivo_app/lib/features/fleet/screens/fleet_bulk_quote_screen.dart (new)
- branivo_app/lib/features/fleet/screens/fleet_bulk_purchase_result_dialog.dart (new)
- branivo_app/lib/features/fleet/widgets/fleet_vehicle_card.dart (modified)
- branivo_app/test/features/fleet/screens/fleet_bulk_purchase_result_dialog_test.dart (new)
